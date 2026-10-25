const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test, expect } = require("@playwright/test");
const { PDFDocument } = require("pdf-lib");

async function makePdf(widths) {
  const pdf = await PDFDocument.create();
  widths.forEach((width, index) => pdf.addPage([width, 500 + index * 10]));
  return Buffer.from(await pdf.save());
}

async function loadPdf(page, name, buffer, input = "#pdfpm-file") {
  await page.locator(input).setInputFiles({ name, mimeType: "application/pdf", buffer });
  await expect(page.locator("#pdfpm-final-count")).toContainText(/\d+ page/);
  await expect(page.locator("#pdfpm-editor")).toBeVisible();
}

async function exportPdf(page) {
  await page.locator("#pdfpm-export").click();
  await expect(page.locator("#pdfpm-download")).toBeVisible({ timeout: 30000 });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#pdfpm-download").click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  assert.ok(outputPath);
  return PDFDocument.load(fs.readFileSync(outputPath));
}

test("reorders, deletes, undoes, and exports the visible page sequence", async ({ page }) => {
  test.setTimeout(60000);
  page.on("pageerror", error => console.log("Browser page error:", error.message));
  await page.goto("/tools/pdf-page-manager/");
  const source = await makePdf([300, 400, 500]);
  await loadPdf(page, "ordered.pdf", source);

  await page.locator("#pdfpm-pages [data-select-page]").nth(1).check();
  await page.locator("#pdfpm-move-up").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#pdfpm-page-summary")).toContainText("1 selected");
  await expect(page.locator("#pdfpm-pages .pdfpm-page-label").nth(0)).toHaveText("Page 1");

  await page.locator("#pdfpm-clear-selection").click();
  await page.locator("#pdfpm-pages [data-select-page]").nth(2).check();
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#pdfpm-delete").click();
  await expect(page.locator("#pdfpm-final-count")).toContainText("2 pages");
  await page.locator("#pdfpm-undo").click();
  await expect(page.locator("#pdfpm-final-count")).toContainText("3 pages");

  const output = await exportPdf(page);
  assert.deepEqual(output.getPages().map(pdfPage => Math.round(pdfPage.getWidth())), [400, 300, 500]);
});

test("inserts blank and image pages, then appends another PDF locally", async ({ page }) => {
  test.setTimeout(60000);
  const remoteRequests = [];
  page.on("request", request => {
    if (request.url().startsWith("http") && !request.url().startsWith("http://localhost:3000")) {
      remoteRequests.push(request.url());
    }
  });
  await page.goto("/tools/pdf-page-manager/");
  await loadPdf(page, "main.pdf", await makePdf([300]));

  await page.locator("#pdfpm-add-blank").click();
  await expect(page.locator("#pdfpm-final-count")).toContainText("2 pages");
  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    canvas.getContext("2d").fillRect(0, 0, 1, 1);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#pdfpm-image-file").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(pngBase64, "base64")
  });
  await expect(page.locator("#pdfpm-final-count")).toContainText("3 pages");

  await page.locator("#pdfpm-second-file").setInputFiles({
    name: "append.pdf",
    mimeType: "application/pdf",
    buffer: await makePdf([700, 800])
  });
  await expect(page.locator("#pdfpm-source")).toBeVisible();
  await page.locator("#pdfpm-append-source").click();
  await expect(page.locator("#pdfpm-final-count")).toContainText("5 pages");

  const output = await exportPdf(page);
  assert.deepEqual(output.getPages().map(pdfPage => Math.round(pdfPage.getWidth())), [300, 300, 300, 700, 800]);
  assert.deepEqual(remoteRequests, []);
});

test("inserts selected secondary pages in order and supports redo and reset", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/tools/pdf-page-manager/");
  await loadPdf(page, "main.pdf", await makePdf([300, 400, 500]));
  await page.locator("#pdfpm-second-file").setInputFiles({
    name: "source.pdf",
    mimeType: "application/pdf",
    buffer: await makePdf([600, 700])
  });
  await expect(page.locator("#pdfpm-source")).toBeVisible();

  await page.locator("#pdfpm-position").selectOption("after");
  await page.locator("#pdfpm-pages [data-select-page]").nth(1).check();
  await page.locator("#pdfpm-source-pages [data-select-page]").nth(1).check();
  await page.locator("#pdfpm-insert-source").click();
  await expect(page.locator("#pdfpm-final-count")).toContainText("4 pages");
  const inserted = await exportPdf(page);
  assert.deepEqual(inserted.getPages().map(pdfPage => Math.round(pdfPage.getWidth())), [300, 400, 700, 500]);

  await page.locator("#pdfpm-undo").click();
  await expect(page.locator("#pdfpm-final-count")).toContainText("3 pages");
  await page.locator("#pdfpm-redo").click();
  await expect(page.locator("#pdfpm-final-count")).toContainText("4 pages");
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#pdfpm-reset").click();
  await expect(page.locator("#pdfpm-final-count")).toContainText("3 pages");
  const reset = await exportPdf(page);
  assert.deepEqual(reset.getPages().map(pdfPage => Math.round(pdfPage.getWidth())), [300, 400, 500]);
});

test("rejects malformed PDFs with an accessible error", async ({ page }) => {
  await page.goto("/tools/pdf-page-manager/");
  await page.locator("#pdfpm-file").setInputFiles({
    name: "malformed.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nnot a valid document")
  });
  await expect(page.locator("#pdfpm-error")).toBeVisible();
  await expect(page.locator("#pdfpm-error")).toContainText("not a valid PDF");
});

test("supports drag-and-drop page reordering", async ({ page }) => {
  await page.goto("/tools/pdf-page-manager/");
  await loadPdf(page, "drag.pdf", await makePdf([300, 400, 500]));
  await page.locator("#pdfpm-pages .pdfpm-page-card").nth(2)
    .dragTo(page.locator("#pdfpm-pages .pdfpm-page-card").nth(0));
  const output = await exportPdf(page);
  assert.deepEqual(output.getPages().map(pdfPage => Math.round(pdfPage.getWidth())), [500, 300, 400]);
});
