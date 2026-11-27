/*
 * seo-copy.js - unique, deterministic search copy for generated tool pages.
 *
 * The image and audio registries share a small set of default FAQ/privacy/how-to
 * strings. Reusing those sentences verbatim across 90 pages makes otherwise
 * useful tools look like scaled near-duplicates to crawlers. This module keeps
 * the registry untouched and derives distinct copy from each tool's own name,
 * inputs, outputs, first use case and limitation.
 *
 * UMD: Node build/verify scripts require it; the browser toolkit runtimes read
 * window.SeoCopy so client-side mounting cannot overwrite the improved static
 * copy with the registry's older shared defaults.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../src/config/site.config.js"));
  } else {
    root.SeoCopy = factory(root.SiteConfig || {});
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (site) {
  "use strict";

  const UPDATED = Object.assign(
    { image: site.LAST_UPDATED || "2026-10-25", audio: site.LAST_UPDATED || "2026-10-25" },
    site.TOOLKIT_UPDATED || {}
  );

  const cache = new Map();

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clean(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function clause(value) {
    return clean(value).replace(/[.!?]+$/, "");
  }

  function lowerFirst(value) {
    const text = clean(value);
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }

  function firstSentence(value) {
    const text = clean(value);
    if (!text) return "";
    const match = text.match(/^[^.!?]+[.!?]?/);
    return clean(match ? match[0] : text);
  }

  function inputPhrase(tool, kind) {
    const inputs = (tool.inputs || []).map(clause).filter(Boolean);
    if (!inputs.length) {
      return tool.requiresFile === false
        ? "no source file"
        : `a local ${kind === "audio" ? "audio" : "image"} file`;
    }
    if (inputs.length === 1) return inputs[0];
    if (inputs.length === 2) return inputs.join(" or ");
    return `${inputs.slice(0, 2).join(", ")} and other supported formats`;
  }

  function outputPhrase(tool) {
    const outputs = (tool.outputs || []).map(clause).filter(Boolean);
    if (!outputs.length) return "a downloadable result";
    if (outputs.length === 1) return outputs[0];
    if (outputs.length === 2) return outputs.join(" and ");
    return `${outputs.slice(0, 2).join(", ")} and other outputs`;
  }

  function usePhrase(tool, kind) {
    if (tool.useCases && tool.useCases.length) return clause(tool.useCases[0]);
    return `${kind === "audio" ? "audio" : "image"} work that stays on this device`;
  }

  function limitSentence(tool) {
    const limit = firstSentence(tool.limitations || tool.reason || "");
    return limit || "Browser and device limits still apply.";
  }

  function trimIncompleteTail(text) {
    let value = clean(text);
    const dangling = /\s+(?:a|an|and|the|with|from|to|of|for|built|[a-z])$/i;
    while (dangling.test(value)) {
      value = value.replace(dangling, "").replace(/[\s,;:]+$/, "");
    }
    return value;
  }

  function fit(text, min, max) {
    let value = clean(text);
    const escapedLength = candidate => esc(candidate).length;
    // Stop at a word boundary that still fits after HTML escaping. Config
    // strings such as "Application & Signature" grow by four bytes when the
    // ampersand is escaped in the meta tag.
    while (escapedLength(value) > max) {
      const cut = value.lastIndexOf(" ");
      if (cut <= 0) {
        value = value.slice(0, max).replace(/[\s,;:]+$/, "");
        break;
      }
      value = value.slice(0, cut).replace(/[\s,;:]+$/, "");
    }
    value = trimIncompleteTail(value);
    if (!/[.!?]$/.test(value) && escapedLength(value + ".") <= max) value += ".";
    const pads = [
      " Files stay on your device.",
      " No upload is needed.",
      " The result downloads locally."
    ];
    let i = 0;
    while (escapedLength(value) < min && i < pads.length * 3) {
      const candidate = value + pads[i % pads.length];
      if (escapedLength(candidate) > max) break;
      value = candidate;
      i += 1;
    }
    return clean(value);
  }

  function seoDescription(tool, kind) {
    const summary = clean(tool.summary);
    const original = clean(tool.seoDescription);
    const escapedLength = text => esc(text).length;
    if (original && escapedLength(original) >= 120 && escapedLength(original) <= 155) {
      if (original !== summary) return original;
      // A handful of registries reuse the summary as the meta description.
      // Keep the accurate sentence and add a short privacy/price note instead
      // of truncating it at an arbitrary word boundary.
      for (const tail of [' No upload.', ' Local.', ' Free.']) {
        if (escapedLength(original + tail) <= 155) return original + tail;
      }
    }
    const base = `${tool.name}: ${clause(summary)} Built for ${usePhrase(tool, kind)}, with no upload or account.`;
    return fit(base, 120, 155);
  }

  function description(tool, kind, seoDescriptionText) {
    const original = clean(tool.description);
    const summary = clean(tool.summary);
    if (original && original !== summary && original !== seoDescriptionText && original.length >= 60) return original;
    return clean(
      `${tool.name} handles ${lowerFirst(clause(summary))}. It is built for ${usePhrase(tool, kind)}, ` +
      `accepts ${inputPhrase(tool, kind)}, and returns ${outputPhrase(tool)} from local browser memory. ` +
      `${limitSentence(tool)}`
    );
  }

  function quickAnswer(tool, kind) {
    return clean(
      `${tool.name} works on ${inputPhrase(tool, kind)} locally in your browser for ${clause(tool.summary)}. ` +
      `Typical use: ${lowerFirst(usePhrase(tool, kind))}. No upload is required.`
    );
  }

  function detail(tool, kind) {
    return clean(
      `${tool.name} is scoped to ${usePhrase(tool, kind)}: it accepts ${inputPhrase(tool, kind)}, ` +
      `produces ${outputPhrase(tool)}, and exposes only the controls that job needs. ${limitSentence(tool)}`
    );
  }

  function privacyNote(tool, kind) {
    const noun = kind === "audio" ? "audio" : "image";
    return clean(
      `${tool.name} reads ${inputPhrase(tool, kind)} from local memory, creates ${outputPhrase(tool)} ` +
      `with browser APIs, and keeps the result in a temporary object URL until you download it or leave the page. ` +
      `No ${noun} bytes are uploaded, logged, or stored by Bench.`
    );
  }

  function processNote(tool, engineLabel, kind) {
    const noun = kind === "audio" ? "audio" : "image";
    if (/ffmpeg/i.test(engineLabel)) {
      return clean(
        `${tool.name} uses FFmpeg.wasm on this device to create ${outputPhrase(tool)}. ` +
        `The engine is loaded from this site on first use and cached afterwards; no source ${noun} is uploaded.`
      );
    }
    if (/microphone/i.test(engineLabel)) {
      return clean(
        `${tool.name} opens the microphone only after you press start and keeps the capture in local memory. ` +
        `Bench never receives or stores the recording.`
      );
    }
    return clean(
      `${tool.name} uses ${engineLabel} directly in your browser to create ${outputPhrase(tool)}. ` +
      `Every intermediate buffer stays on this device and no ${noun} leaves the page.`
    );
  }

  const GENERIC_ANSWERS = [
    /^No\.\s+Processing happens in your browser and the file is never sent to Bench or a third party\.?$/i,
    /^Decoding, editing and encoding all run inside your browser using Canvas and File APIs\.?$/i,
    /^Yes\.\s+The tool runs locally in your browser with no account, subscription or watermark on your output\.?$/i,
    /^The file is never uploaded, logged or stored by Bench\.?$/i
  ];

  function faqAnswer(tool, question, answer, kind) {
    if (!GENERIC_ANSWERS.some(pattern => pattern.test(clean(answer)))) return answer;
    if (/free|account|subscription|watermark/i.test(clean(question))) {
      return clean(
        `${tool.name} is free, needs no account, and adds no watermark. ${lowerFirst(detail(tool, kind))}`
      );
    }
    return clean(`${tool.name} keeps this job on your device. ${lowerFirst(privacyNote(tool, kind))}`);
  }

  function howToSteps(tool, kind, steps) {
    return (steps || []).map(step => {
      const text = clean(step);
      if (/^Add (a|an) (supported )?(audio |image )?file\.?$/i.test(text)) {
        return `Add ${inputPhrase(tool, kind)} to ${tool.name}.`;
      }
      if (/^Upload (a|an|one|your) (audio |image )?file\.?$/i.test(text)) {
        return `Upload ${inputPhrase(tool, kind)} for ${tool.name}.`;
      }
      if (/^Adjust the settings\.?$/i.test(text)) {
        return `Choose the ${outputPhrase(tool)} settings for ${tool.name}.`;
      }
      if (/^Run the tool and download the result\.?$/i.test(text)) {
        return `Run ${tool.name} and download the ${outputPhrase(tool)} locally.`;
      }
      return step;
    });
  }

  function forTool(tool, kind) {
    const key = `${kind}:${tool.slug}`;
    if (cache.has(key)) return cache.get(key);
    const generatedSeoDescription = seoDescription(tool, kind);
    const value = {
      updated: UPDATED[kind] || site.LAST_UPDATED || "2026-10-25",
      summary: clean(tool.summary),
      seoDescription: generatedSeoDescription,
      description: description(tool, kind, generatedSeoDescription),
      quickAnswer: quickAnswer(tool, kind),
      detail: detail(tool, kind),
      privacyNote: privacyNote(tool, kind),
      processNote: engineLabel => processNote(tool, engineLabel, kind),
      faqAnswer: (question, answer) => faqAnswer(tool, question, answer, kind),
      howTo: steps => howToSteps(tool, kind, steps)
    };
    cache.set(key, value);
    return value;
  }

  return { forTool, UPDATED };
});
