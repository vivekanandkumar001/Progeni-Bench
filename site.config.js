/*
 * site.config.js - Single Source of Truth for Brand and Tool Metadata
 * UMD module for Browser and Node.js environments
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SiteConfig = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const PARENT_BRAND = "Progeni";
  const PARENT_URL = "https://progeni.live";
  const SITE_NAME = "Progeni Bench";
  const SITE_SHORT = "Bench";
  const SITE_URL = "https://bench.progeni.live";
  const SUPPORT_EMAIL = "support@progeni.live";
  const TAGLINE = "Small file jobs, done privately in your browser.";
  const LOCALE = "en-IN";

  const TOOLS = [
    {
      id: "sticker-sheet",
      icon: "🏷️",
      cat: "Print & Craft",
      name: "Sticker Sheet Maker",
      keyword: "Sticker Sheet Maker",
      desc: "Arrange images into printable US Letter / A4 sticker sheets for Cricut, Silhouette, or home printers.",
      seoDesc: "Create printable sticker sheets in your browser. Tile and arrange multiple transparent PNG designs onto US Letter or A4 grids without server uploads.",
      whatItDoes: "Arranges multiple image graphics into an evenly spaced multi-column printable sticker layout on US Letter, A4, or 4x6 inch paper dimensions. Each sticker artwork is scaled uniformly to preserve sharp visual resolution and prevent irregular edge clipping during manual scissors trimming or vinyl cutting.",
      howToUse: [
        "Select your target paper standard (US Letter 8.5x11 inch, A4 210x297 mm, or 4x6 photo paper).",
        "Drag and drop up to 12 image graphics (transparent PNG or JPEG) into the upload container.",
        "Preview the auto-arranged composite grid directly on the responsive canvas viewport.",
        "Click Download High-Res Print Sheet to save your 300 DPI composite PNG file ready for printing."
      ],
      limits: "Composites up to 12 graphic files onto a single physical sheet. Does not automatically generate vector SVG cut paths or contour registration marks.",
      privacy: "All canvas operations and image composing execute locally in your web browser memory. Your illustrations and design assets are never transmitted to external cloud servers."
    },
    {
      id: "labels",
      icon: "📦",
      cat: "Print & Craft",
      name: "Avery 5160 / Label Maker",
      keyword: "Avery 5160 Label Maker",
      desc: "Generate printable US Letter Avery 5160, 5163, and A4 address label sheets directly from CSV.",
      seoDesc: "Generate printable Avery 5160 and 5163 address label sheets in your browser from CSV files. Format mailing lists with zero data uploads.",
      whatItDoes: "Parses uploaded CSV contact spreadsheets and formats standardized Avery 5160 (30 address labels per sheet), Avery 5163 (10 large shipping labels per sheet), or A4 grid templates. Automatically calculates CSS page print breaks and padding to align precisely with physical adhesive sticker sheets.",
      howToUse: [
        "Upload a spreadsheet CSV file containing customer names, physical mailing addresses, or inventory SKU numbers.",
        "Choose your target template standard (Avery 5160 30-up, Avery 5163 10-up, or A4 standard 24-up).",
        "Select which specific spreadsheet column contains the destination text to print on the label cells.",
        "Click Generate Printable Sheet and download your standalone print-ready HTML document."
      ],
      limits: "Formats plain text strings into standardized label cells. Does not render custom QR barcodes or embedded graphical corporate logos.",
      privacy: "Your customer spreadsheets and confidential mailing lists are parsed purely via client-side JavaScript. Private data never leaves your personal workstation."
    },
    {
      id: "tshirt-mirror",
      icon: "👕",
      cat: "Print & Craft",
      name: "T-Shirt Print Mirror",
      keyword: "T-Shirt Print Mirror",
      desc: "Mirror artwork horizontally for heat transfer paper and iron-on vinyl printing.",
      seoDesc: "Mirror artwork and typography horizontally in your browser for heat transfer paper. Flip shirt designs with no quality loss and zero uploads.",
      whatItDoes: "Performs an exact geometric horizontal reflection across the vertical Y-axis on uploaded artwork and typography designs. Essential for light heat transfer papers and iron-on vinyl where designs are placed face-down on fabric and heat-pressed, ensuring lettering and numbers appear in the correct readable orientation.",
      howToUse: [
        "Drag and drop your finished apparel graphic or typography banner (PNG, JPG, or SVG).",
        "The browser tool automatically applies a horizontal flip transformation to the graphic canvas.",
        "Inspect the mirrored preview to verify all numbers, words, and asymmetrical logos are inverted.",
        "Download the processed high-resolution PNG file ready for your inkjet or laser transfer printer."
      ],
      limits: "Flips one graphic per operation at original pixel dimensions. Does not perform color separations or CMYK halftone dot screening for screen-printing.",
      privacy: "Image transformation is handled exclusively within HTML5 Canvas in local browser RAM. Creative apparel designs are processed with strict privacy."
    },
    {
      id: "ironon-sheet",
      icon: "🧲",
      cat: "Print & Craft",
      name: "Iron-on Transfer Sheet Maker",
      keyword: "Iron-on Transfer Sheet Maker",
      desc: "Tile and arrange multiple designs on US Letter or A4 heat transfer paper.",
      seoDesc: "Tile iron-on transfer designs onto printable sheets in your browser. Maximize heat transfer vinyl layout efficiency with zero server uploads.",
      whatItDoes: "Tiles multiple logos, chest emblems, pocket badges, or jersey numbers across standard heat transfer paper dimensions. Optimizes layout density to minimize expensive vinyl and transfer paper waste during craft apparel production and DIY merchandise printing.",
      howToUse: [
        "Choose your target transfer paper format (US Letter 8.5x11 inch or International A4).",
        "Drop multiple badge or emblem artwork files into the drop container to populate the sheet grid.",
        "Review the automated grid spacing and margin layout to ensure adequate cutting margins.",
        "Download the high-resolution composite sheet file for immediate home or workshop printing."
      ],
      limits: "Tiles up to 12 graphics onto a single print sheet. Does not automatically invert artwork; please use the T-Shirt Print Mirror tool first if using light transfer paper.",
      privacy: "Image compositing occurs entirely within your local browser sandbox. No brand assets or personal logos are ever sent to remote cloud infrastructure."
    },
    {
      id: "print-layout",
      icon: "🖨️",
      cat: "Print & Craft",
      name: "Print Layout Optimizer",
      keyword: "Print Layout Optimizer",
      desc: "Fit multiple photos onto US Letter, A4, or 4×6 inch paper with uniform margins.",
      seoDesc: "Fit and optimize multiple photos onto standard printable paper sheets in your browser. Align pictures with uniform borders and zero uploads.",
      whatItDoes: "Calculates optimal 2x2 and 3x2 grid layouts to fit multiple personal photographs onto standard printer sheets while enforcing balanced white borders. Automatically computes aspect ratio scaling factors to ensure photos are presented cleanly without awkward perspective distortion or subject truncation.",
      howToUse: [
        "Select your destination paper format (US Letter, A4 international, 4x6 photo paper, or A3 poster sheet).",
        "Add between 1 and 12 photographs from your computer or camera memory card.",
        "Examine the real-time layout canvas for spacing, alignment, and outer border balance.",
        "Click the download button to receive a crisp 300 DPI composite file ready for printing."
      ],
      limits: "Scales images using uniform letterboxing to preserve native aspect ratios. Does not support arbitrary freehand collaging, diagonal rotation, or polygonal cropping.",
      privacy: "Your family snapshots and personal prints remain strictly on your machine. Client-side canvas processing ensures complete data isolation."
    },
    {
      id: "print-border",
      icon: "📐",
      cat: "Print & Craft",
      name: "Photo Print Border Calculator",
      keyword: "Photo Print Border Calculator",
      desc: "Add precise white matting/borders for US 4×6, 5×7, 8×10 inch or European frames.",
      seoDesc: "Add precise white matting borders to your digital photos in your browser. Prepare pictures for standard frames with zero server uploads.",
      whatItDoes: "Expands the canvas boundaries of digital photographs to add uniform white gallery matting borders. Allows photographers and hobbyists to prepare images for standard picture frames without suffering unexpected edge cropping by photo print labs.",
      howToUse: [
        "Select and drop a digital image file into the border calculator interface.",
        "The tool automatically calculates and expands the outer canvas margin by a proportional 6%.",
        "Preview the matted photograph inside the responsive visual result container.",
        "Download the framed PNG image file ready for commercial lab printing or framing."
      ],
      limits: "Applies a proportional solid white border. Does not generate textured wooden picture frames, beveled acrylic bevels, or drop shadow overlays.",
      privacy: "Image expansion is executed in local device RAM using HTML5 Canvas. Your personal photographs never leave your browser environment."
    },
    {
      id: "cross-stitch",
      icon: "🧵",
      cat: "Print & Craft",
      name: "Cross-Stitch Pattern Maker",
      keyword: "Cross-Stitch Pattern Maker",
      desc: "Convert photos into printable color-coded grids with standard DMC thread references.",
      seoDesc: "Convert photos into cross-stitch pattern grids in your browser. Map digital colors to standard DMC thread floss codes with zero server uploads.",
      whatItDoes: "Quantizes digital photos into a structured 50-column pixelated cross-stitch embroidery chart. Evaluates every color cluster using Euclidean RGB distance algorithms to match pixels against official standard DMC embroidery floss references, producing a clear stitch count legend.",
      howToUse: [
        "Upload any digital photo, portrait, or illustration into the pattern generator.",
        "The tool processes pixel clusters and renders a 50-column color-coded stitch chart.",
        "Review the generated stitch grid and the accompanying DMC embroidery floss legend.",
        "Download the high-resolution pattern chart PNG containing floss numbers and stitch counts."
      ],
      limits: "Fixed at a 50-column resolution grid for readability. Does not generate monochrome symbol overlays or backstitch contour outlines.",
      privacy: "Color quantization and thread matching run purely in client-side JavaScript. Your craft patterns and family portraits remain 100% confidential."
    },
    {
      id: "diamond-painting",
      icon: "💎",
      cat: "Print & Craft",
      name: "Diamond Painting Pattern Maker",
      keyword: "Diamond Painting Pattern Maker",
      desc: "Generate symbol-coded grids and DMC color palettes from any photo.",
      seoDesc: "Generate diamond painting chart grids from photos in your browser. Calculate DMC drill color counts with total privacy and zero data uploads.",
      whatItDoes: "Transforms digital pictures into structured diamond painting drill canvas grids. Calculates total round and square rhinestone drill counts per color code mapped directly to standard DMC craft references, helping crafters plan custom DIY diamond art kits efficiently.",
      howToUse: [
        "Select your source picture and drop it into the diamond painting generator.",
        "The algorithm quantizes colors and renders a tiled diamond drill chart on screen.",
        "Check the DMC drill requirement summary table showing color numbers and bead estimates.",
        "Save the high-resolution grid pattern to your local hard drive for crafting."
      ],
      limits: "Generates square drill visual grid approximations. Does not output adhesive backing templates with proprietary symbol fonts.",
      privacy: "All color parsing and chart rendering execute inside your browser sandbox. No personal artwork or family pictures are sent to remote servers."
    },
    {
      id: "embroidery",
      icon: "🪡",
      cat: "Print & Craft",
      name: "Embroidery Pattern Simplifier",
      keyword: "Embroidery Pattern Simplifier",
      desc: "Reduce artwork into a simplified DMC thread color palette for embroidery.",
      seoDesc: "Simplify images into embroidery thread color palettes in your browser. Map artwork to core DMC floss shades with zero server uploads.",
      whatItDoes: "Reduces complex gradient illustrations and continuous-tone images into a clean, simplified palette of core thread colors. Provides hand embroiderers with an actionable color reduction reference, making it easy to select matching physical floss skeins for hand stitching projects.",
      howToUse: [
        "Drag and drop your illustration or photo into the embroidery simplifier tool.",
        "The palette engine clusters colors against primary standard DMC embroidery thread shades.",
        "Review the simplified color block distribution and estimated stitch percentages.",
        "Download the simplified pattern reference graphic for your needlework hoop."
      ],
      limits: "Designed for hand embroidery color planning and floss selection. Does not generate computerized machine embroidery stitch files such as DST, PES, or JEF formats.",
      privacy: "Local canvas processing guarantees your original illustrations, textile concepts, and family photos remain confidential on your device."
    },
    {
      id: "video-safe-zone",
      icon: "📱",
      cat: "Audio & Video",
      name: "Video Safe-Zone Checker",
      keyword: "Video Safe-Zone Checker",
      desc: "Preview TikTok, Instagram Reels, and YouTube Shorts UI overlays to avoid cropped text.",
      seoDesc: "Preview TikTok, Reels, and Shorts safe zones in your browser. Check video text overlays against social media UI with zero file uploads.",
      whatItDoes: "Overlays precise 9:16 vertical safe zone boundaries for TikTok, Instagram Reels, and YouTube Shorts over your videos or frame grabs. Highlights critical obstruction zones where usernames, engagement action buttons (likes, shares, comments), audio discs, and captions cover screen content.",
      howToUse: [
        "Select your target social media platform (TikTok UI, Instagram Reels, or YouTube Shorts).",
        "Upload a short-form video clip (MP4, WebM, or MOV) or a static 9:16 frame export.",
        "Examine the red overlay guide showing where platform interface elements will appear.",
        "Download the overlaid guide image to adjust title placement and subtitle positioning in your video editor."
      ],
      limits: "Extracts and evaluates representative video frames for UI alignment. Does not re-render, compress, or re-encode full multi-minute video streams.",
      privacy: "Video frames are extracted locally using HTML5 Video elements and Canvas. Video files never travel across the network to external servers."
    },
    {
      id: "video-thumbnails",
      icon: "🎞️",
      cat: "Audio & Video",
      name: "Video Thumbnail Contact Sheet",
      keyword: "Video Thumbnail Contact Sheet",
      desc: "Extract 12 evenly spaced high-res frames from MP4/MOV videos in your browser.",
      seoDesc: "Extract 12 evenly spaced video thumbnail frames in your browser. Generate high-resolution contact sheets from MP4 files with zero uploads.",
      whatItDoes: "Scans through local video media files and automatically extracts 12 evenly spaced timestamped frames into a clean 3x4 grid contact sheet. Allows video editors, creators, and archivists to quickly inspect video pacing, scene changes, and visual quality without opening dedicated video software.",
      howToUse: [
        "Drop any MP4, WebM, or MOV video file into the video thumbnail extractor interface.",
        "The browser engine seeks through the video timeline to capture 12 progressive frame grabs.",
        "View the assembled 12-frame composite contact sheet rendered in the browser.",
        "Click Download Contact Sheet to save the full-resolution summary image to your device."
      ],
      limits: "Requires browser-supported codecs (H.264, VP8, VP9, AV1). High-bitrate Apple ProRes, raw AVI, or MKV containers not supported by your browser cannot be decoded.",
      privacy: "Video decoding and frame rendering occur entirely through local browser hardware acceleration. Zero bytes of your video footage are sent to any server."
    },
    {
      id: "audio-chapters",
      icon: "🎧",
      cat: "Audio & Video",
      name: "Chapter Timestamp Formatter",
      keyword: "Chapter Timestamp Formatter",
      desc: "Format YouTube & podcast chapter timestamps with clean text export.",
      seoDesc: "Format YouTube and podcast chapter timestamps in your browser. Clean and standardize video show notes with total privacy and zero uploads.",
      whatItDoes: "Validates, cleans, and standardizes podcast and YouTube video chapter markers. Ensures timestamps are sorted chronologically, correctly padded (MM:SS or HH:MM:SS), separated by valid delimiters, and compliant with platform chapter guidelines.",
      howToUse: [
        "Paste your raw timestamp notes and chapter titles into the multiline text input box.",
        "Verify the syntax to ensure the first chapter begins precisely at 00:00 as required by platforms.",
        "Click the Download Chapters button to receive a formatted chapters.txt file.",
        "Paste the cleaned output directly into your YouTube description, Spotify show notes, or podcast RSS feed."
      ],
      limits: "Formats and validates plain text timecode strings. Does not embed ID3v2 chapter frames directly into binary MP3 or M4A audio containers.",
      privacy: "Text formatting is executed in local browser JavaScript. Your unreleased episode titles and show notes remain 100% private on your device."
    },
    {
      id: "silence-map",
      icon: "🔇",
      cat: "Audio & Video",
      name: "Podcast Silence Map",
      keyword: "Podcast Silence Map",
      desc: "Analyze audio waveforms locally to detect dead air and pause durations.",
      seoDesc: "Analyze audio waveforms and find dead air gaps in your browser. Detect silence durations in podcast audio locally with zero server uploads.",
      whatItDoes: "Decodes audio tracks using the Web Audio API and runs root-mean-square (RMS) energy analysis across the waveform to detect dead air gaps and pauses longer than 500 milliseconds. Generates a chronological list of silence start times and durations to speed up podcast and interview editing.",
      howToUse: [
        "Drop a podcast audio track (WAV, MP3, AAC, or OGG) into the silence detector.",
        "Wait a few moments while the local Web Audio engine decodes and audits the audio buffer.",
        "Review the generated list of dead air intervals showing exact start and end timestamps.",
        "Use the timestamp report to quickly locate and trim long pauses in your digital audio workstation (DAW)."
      ],
      limits: "Decodes audio into browser RAM; extremely large audio files (>200MB) may encounter memory limits on memory-constrained mobile devices.",
      privacy: "Audio decoding, waveform inspection, and silence mapping execute entirely on your local CPU. Unreleased audio files never leave your computer."
    },
    {
      id: "subtitle-speed",
      icon: "💬",
      cat: "Text & Subtitles",
      name: "Subtitle Reading-Speed Checker",
      keyword: "Subtitle Reading-Speed Checker",
      desc: "Audit SRT subtitles for high Characters-Per-Second (CPS), duration, and overlaps.",
      seoDesc: "Audit SRT subtitle reading speed in your browser. Detect high CPS lines, short durations, and timecode overlaps locally with zero uploads.",
      whatItDoes: "Audits SubRip (.srt) subtitle files to identify caption cues that exceed broadcast standards (such as Netflix and BBC guidelines of 21 characters per second). Flags cues with insufficient reading duration, zero-duration errors, and overlapping timecodes to ensure accessibility for viewers.",
      howToUse: [
        "Upload your SubRip (.srt) subtitle caption file into the reading speed auditor.",
        "The engine calculates active duration, character counts, and CPS metrics for every subtitle cue.",
        "Inspect highlighted cues flagged for excessive reading speed or timecode collision errors.",
        "Use the audit summary to adjust caption timing and line splits in your subtitle editor."
      ],
      limits: "Audits SubRip SRT subtitle files. Does not directly extract proprietary binary subtitle streams embedded in container formats like MKV or MP4.",
      privacy: "Subtitle files are parsed purely within client-side memory. Confidential movie scripts, documentary translations, and transcripts remain strictly private."
    },
    {
      id: "subtitle-linefix",
      icon: "📝",
      cat: "Text & Subtitles",
      name: "Subtitle Line-Break Fixer",
      keyword: "Subtitle Line-Break Fixer",
      desc: "Rebalance and wrap long SRT subtitle lines to meet BBC & Netflix guidelines.",
      seoDesc: "Rebalance long SRT subtitle lines in your browser. Wrap caption lines to standard 38-character limits automatically with zero data uploads.",
      whatItDoes: "Rebalances and wraps overlong subtitle lines to comply with industry-standard 38-character limits per line. Breaks text naturally at whitespace word boundaries rather than mid-word, improving readability on mobile devices and television screens without altering timecodes.",
      howToUse: [
        "Drop your unformatted, wide, or single-line .srt subtitle file into the fixer.",
        "The formatting algorithm analyzes timecodes and rewraps text lines exceeding 38 characters.",
        "Inspect the notice showing total cues processed and rebalanced line breaks.",
        "Download the corrected, broadcast-compliant .srt subtitle file directly to your disk."
      ],
      limits: "Rebalances plain text caption lines. Does not modify timing cue points, adjust start/end timestamps, or translate language text.",
      privacy: "All text parsing and subtitle file generation run in client JavaScript. Your transcripts and film dialogue are never sent to third-party servers."
    },
    {
      id: "contact-dedupe",
      icon: "👥",
      cat: "Data",
      name: "Contact CSV Deduplicator",
      keyword: "Contact CSV Deduplicator",
      desc: "Merge and clean duplicate CRM contacts using email and international phone numbers.",
      seoDesc: "Deduplicate contact CSV files in your browser. Merge duplicate CRM records using email and normalized phone numbers with zero data uploads.",
      whatItDoes: "Identifies and removes duplicate customer or contact rows in CSV exports by normalizing email casing and stripping non-digit phone formatting. Preserves the first primary contact record while cleaning up duplicate entries caused by multiple marketing imports or CRM merges.",
      howToUse: [
        "Drop your CRM or address book CSV file into the contact deduplicator drop area.",
        "The tool automatically detects email and phone number columns across your dataset.",
        "Review the summary displaying total unique contacts preserved and duplicate rows removed.",
        "Download the cleaned, deduplicated CSV file ready for CRM import or email marketing."
      ],
      limits: "Matches records using normalized email strings and cleaned phone digits. Does not perform fuzzy phonetic name matching or nickname deduplication.",
      privacy: "Customer names, phone numbers, and emails are processed solely in local browser memory. Zero risk of CRM data leaks or privacy violations."
    },
    {
      id: "csv-splitter",
      icon: "↔️",
      cat: "Data",
      name: "CSV Column Splitter",
      keyword: "CSV Column Splitter",
      desc: "Split names, addresses, or delimited data in CSV spreadsheets without Excel.",
      seoDesc: "Split CSV columns in your browser without Excel. Separate full names and addresses into distinct columns locally with zero server uploads.",
      whatItDoes: "Splits combined spreadsheet columns (such as 'First Last' names, 'City, State, Zip' addresses, or compound product SKUs) into distinct separate columns based on spaces, commas, or custom delimiters without needing Microsoft Excel or complex spreadsheet formulas.",
      howToUse: [
        "Upload any standard CSV spreadsheet file from your local computer.",
        "Choose the specific column index containing the combined text you need to divide.",
        "Specify the delimiter character to split on (defaults to a single space character).",
        "Click the Split Column button and download your restructured, multi-column CSV file."
      ],
      limits: "Handles RFC 4180 compliant CSV files with quoted strings. Extremely large datasets (>50MB) may take several seconds to parse in browser memory.",
      privacy: "Spreadsheet records are parsed client-side with pure JavaScript. No sensitive financial records or corporate spreadsheets are transmitted online."
    },
    {
      id: "csv-date",
      icon: "📆",
      cat: "Data",
      name: "CSV Date Normalizer",
      keyword: "CSV Date Normalizer",
      desc: "Standardize mixed dates into US (MM/DD/YYYY), ISO (YYYY-MM-DD), or European formats.",
      seoDesc: "Standardize mixed date formats in CSV files in your browser. Convert dates to ISO YYYY-MM-DD or DD/MM/YYYY with zero server uploads.",
      whatItDoes: "Scans mixed-format date columns across spreadsheet rows and converts every value into a uniform target convention: ISO (YYYY-MM-DD), US (MM/DD/YYYY), or European (DD/MM/YYYY). Fixes inconsistent formatting resulting from disparate database exports or international data collection.",
      howToUse: [
        "Upload a CSV spreadsheet containing dates written in varying or inconsistent formats.",
        "Select the column index containing date information from your table header.",
        "Choose your target date format standard from the dropdown selection menu.",
        "Click Normalize Dates and download your standardized, clean CSV spreadsheet."
      ],
      limits: "Parses ISO, US, and European formatted date strings. Ambiguous numeric dates (such as 02/03/2024) are parsed adhering to standard convention rules.",
      privacy: "Data transformation happens strictly inside your local browser instance. No database records or customer logs are uploaded."
    },
    {
      id: "vcard",
      icon: "📇",
      cat: "Data",
      name: "vCard (VCF) Split & Merge",
      keyword: "vCard VCF Split and Merge",
      desc: "Merge multiple .vcf contact cards or inspect contact files privately.",
      seoDesc: "Split and merge vCard VCF contact files in your browser. Unfold RFC 6350 lines and inspect digital business cards with zero data uploads.",
      whatItDoes: "Parses RFC 6350 vCard files, handles multi-line folded fields, and enables users to inspect individual contact cards or combine multiple .vcf files into one master archive. Facilitates seamless contact migration across Android, Apple iOS, Microsoft Outlook, and Google Contacts.",
      howToUse: [
        "Select one or multiple .vcf contact cards from your device storage.",
        "The parser unfolds continuation lines and displays all detected contact records.",
        "Download individual .vcf cards or export a single combined master .vcf file.",
        "Import the resulting clean contact file into Apple Contacts, Outlook, or Google Contacts."
      ],
      limits: "Supports vCard versions 2.1, 3.0, and 4.0 text structures. Embedded base64 contact photos are preserved but not previewed as visual thumbnails.",
      privacy: "Your private address book and personal contact cards remain strictly on your machine. Client-side parsing ensures total privacy."
    },
    {
      id: "bookmark-cleaner",
      icon: "🔖",
      cat: "Files",
      name: "Chrome Bookmark Cleaner",
      keyword: "Chrome Bookmark Cleaner",
      desc: "Remove duplicate bookmarks, dead links, and empty folders from exported bookmarks.html.",
      seoDesc: "Clean and deduplicate browser bookmark HTML files in your browser. Remove duplicate URLs from Chrome and Firefox exports with zero uploads.",
      whatItDoes: "Parses exported Netscape Bookmark HTML files from Chrome, Firefox, Safari, or Edge, and strips duplicate URLs while maintaining folder structure integrity. Sanitizes messy bookmark collections to reduce clutter and speed up bookmark searches across desktop browsers.",
      howToUse: [
        "Export your browser bookmarks as an HTML file from Chrome or Firefox bookmark manager.",
        "Drop the exported bookmarks.html file into the cleaner drop zone.",
        "The parser scans links and removes duplicate URL entries while preserving folder hierarchies.",
        "Download your cleaned bookmarks.html file and import it back into your browser."
      ],
      limits: "Deduplicates by matching exact canonical URL strings. Does not check remote network connectivity for HTTP 404 broken links.",
      privacy: "Your browsing history and saved bookmarks are sensitive. All parsing is executed in local browser memory with zero external network requests."
    },
    {
      id: "bookmark-reading",
      icon: "📚",
      cat: "Files",
      name: "Bookmark → Reading List",
      keyword: "Bookmark to Reading List",
      desc: "Convert messy browser bookmark HTML files into a distraction-free offline reading list.",
      seoDesc: "Convert browser bookmark HTML exports into clean offline reading lists in your browser. Filter out dangerous URIs with zero server uploads.",
      whatItDoes: "Extracts valid HTTP and HTTPS links from complex bookmark exports and compiles them into a clean, minimalist, offline HTML reading list document. Filters out dangerous URI schemes and excessive nested folder tags, creating an uncluttered reading dashboard for long-form articles.",
      howToUse: [
        "Upload your browser's exported bookmarks.html file into the reading list converter.",
        "The tool sanitizes entries, automatically filtering out javascript: and data: URIs.",
        "Preview the clean list of saved articles and reading links rendered on screen.",
        "Download the standalone reading-list.html document for distraction-free offline reading."
      ],
      limits: "Filters out internal browser schemes (javascript:, data:, chrome:, file:). Does not scrape or archive the full offline text content of linked web pages.",
      privacy: "Your saved articles and reading links never leave your browser sandbox. Complete privacy and local offline storage guaranteed."
    },
    {
      id: "svg-cleaner",
      icon: "✦",
      cat: "Files",
      name: "SVG Cleanup & Minifier",
      keyword: "SVG Cleanup and Minifier",
      desc: "Strip Illustrator, Inkscape metadata, and comments to shrink SVG file sizes.",
      seoDesc: "Clean and sanitize SVG vector files in your browser. Strip Inkscape metadata, scripts, and comments to shrink file size with zero uploads.",
      whatItDoes: "Sanitizes and shrinks SVG vector graphics by recursively removing XML comments, Adobe Illustrator and Inkscape editor metadata namespaces, script tags, foreignObjects, and inline event handlers. Reduces SVG file size while eliminating potential cross-site scripting (XSS) vectors.",
      howToUse: [
        "Drop any vector .svg graphic file into the sanitizer interface.",
        "The parser strips non-standard namespaces, editor comments, and dangerous script tags.",
        "Review the notification displaying file sanitization details.",
        "Download the lightweight, secure, and production-ready SVG vector file."
      ],
      limits: "Optimizes XML document structure and removes security risks. Does not perform lossy coordinate rounding, curve approximation, or visual vector path simplification.",
      privacy: "Sanitization occurs entirely in browser memory using DOMParser. Vector illustrations and proprietary branding graphics are never uploaded to third parties."
    },
    {
      id: "calendar-cleaner",
      icon: "📅",
      cat: "Productivity",
      name: "iCal Calendar Deduplicator",
      keyword: "iCal Calendar Deduplicator",
      desc: "Scan .ics calendar exports for duplicate VEVENT entries and export clean calendars.",
      seoDesc: "Deduplicate iCal ICS calendar files in your browser. Remove duplicate VEVENT calendar entries from Outlook and Google exports with zero uploads.",
      whatItDoes: "Parses iCalendar (.ics) export files, detects duplicate VEVENT calendar blocks sharing identical summary, timestamp, and recurrence properties, and exports a streamlined calendar file. Eliminates annoying duplicated calendar alerts across desktop and mobile devices.",
      howToUse: [
        "Export your calendar from Google Calendar, Microsoft Outlook, or Apple Calendar as an .ics file.",
        "Drop the .ics file into the calendar deduplicator tool interface.",
        "The tool parses calendar entries, identifies duplicate event blocks, and removes duplicates.",
        "Download the cleaned .ics file and re-import it into your calendar application."
      ],
      limits: "Deduplicates based on normalized VEVENT string properties. Does not automatically resolve conflicting event time modifications or update remote CalDAV servers.",
      privacy: "Your personal and professional appointment schedules are kept strictly private on your computer. Zero calendar data is transmitted across the internet."
    },
    {
      id: "timetable-calendar",
      icon: "🗓️",
      cat: "Productivity",
      name: "Timetable → Calendar (.ics)",
      keyword: "Timetable to Calendar Converter",
      desc: "Convert school or work class timetable CSVs into recurring weekly iCal events.",
      seoDesc: "Convert timetable CSV spreadsheets into iCal calendar files in your browser. Create recurring weekly class events with zero data uploads.",
      whatItDoes: "Converts class schedules, university lectures, and work shift timetables from simple CSV spreadsheets into recurring weekly iCal (.ics) calendar events. Generates RFC 5545 compliant recurring VEVENT entries with proper time zone formatting and recurrence rules.",
      howToUse: [
        "Create a CSV with columns: day, start, end, title (e.g., Monday, 09:00, 10:30, Mathematics Lecture).",
        "Upload the CSV schedule file into the timetable converter interface.",
        "Review the number of recurring calendar events generated by the parser.",
        "Download timetable.ics and import it directly into Google Calendar, Apple Calendar, or Outlook."
      ],
      limits: "Generates recurring weekly events for a standard 16-week term. Custom bi-weekly alternating schedules require separate CSV exports.",
      privacy: "Student schedules and employee shift CSVs are parsed locally in browser memory with zero cloud transmission."
    },
    {
      id: "wallpaper",
      icon: "🖼️",
      cat: "Images",
      name: "Wallpaper Photo Cropper",
      keyword: "Wallpaper Photo Cropper",
      desc: "Crop photos to 9:19.5 (iPhone/Android) or 16:9 desktop aspect ratios without distortion.",
      seoDesc: "Crop photos to phone wallpaper aspect ratios in your browser. Fit images to iPhone and Android mobile screens locally with zero uploads.",
      whatItDoes: "Crops and centers high-resolution digital photographs to modern smartphone screen aspect ratios (9:19.5 for iPhone and Android devices) without stretching or distortion. Calculates focal center coordinates to ensure wallpaper images fit lock screens and home screens perfectly.",
      howToUse: [
        "Upload a high-resolution photograph from your camera or photo library.",
        "The tool automatically calculates the exact center-crop for 9:19.5 smartphone displays.",
        "Preview the cropped wallpaper in the viewport preview box.",
        "Download the optimized wallpaper PNG file directly to your smartphone or desktop."
      ],
      limits: "Processes one high-resolution photo per action using center-weighted cropping. Does not add blur padding sidebars or generate animated live wallpapers.",
      privacy: "Photo cropping and canvas rendering happen entirely in local browser RAM. Your personal photos remain 100% private."
    },
    {
      id: "panorama",
      icon: "🌄",
      cat: "Images",
      name: "Panorama Carousel Splitter",
      keyword: "Panorama Carousel Splitter",
      desc: "Seamlessly slice wide panoramic photos into 3 seamless square Instagram carousel tiles.",
      seoDesc: "Split panoramic photos into seamless Instagram carousel tiles in your browser. Slice wide landscape shots into 3 squares with zero uploads.",
      whatItDoes: "Splits ultra-wide panoramic photographs into 3 mathematically seamless square image tiles. Enables photographers and travelers to publish swipeable multi-slide panoramic carousels on Instagram and social feeds without ugly compression or letterboxing.",
      howToUse: [
        "Drag and drop an ultra-wide panoramic landscape photo file into the splitter.",
        "The splitter segments the image width into 3 mathematically seamless adjacent square tiles.",
        "Inspect the 3 carousel tiles rendered side-by-side in the preview pane.",
        "Click each tile to download the individual high-resolution square PNG image files."
      ],
      limits: "Slices images into 3 equal square segments. Requires wide landscape images with aspect ratio of at least 3:1 for optimal square proportions.",
      privacy: "Image slicing executes locally in Canvas memory. Your original landscape and vacation photos are never uploaded to any cloud server."
    },
    {
      id: "duplicate-finder",
      icon: "♻️",
      cat: "Images",
      name: "Photo Duplicate Finder",
      keyword: "Photo Duplicate Finder",
      desc: "Find exact duplicate image files using browser-side SHA-256 cryptographic hashing.",
      seoDesc: "Find duplicate photos in your browser using SHA-256 hashes. Detect exact duplicate image files locally with total privacy and zero uploads.",
      whatItDoes: "Scans batches of digital image files and identifies bit-for-bit duplicate copies using pre-filtered file size grouping and cryptographic SHA-256 binary hashing. Helps photographers and collectors reclaim disk space by finding redundant photo copies quickly and securely.",
      howToUse: [
        "Select multiple image files or drop an entire photo folder from your hard drive.",
        "The browser engine groups matching file sizes and hashes binary data using the SubtleCrypto API.",
        "Review the duplicate report showing exact duplicate groupings and file names.",
        "Use the findings to clean up redundant duplicate copies from your local storage."
      ],
      limits: "Identifies byte-for-byte exact duplicate files. Does not detect perceptual similarities between differently compressed or resized versions.",
      privacy: "Binary cryptographic hashing executes purely on your device CPU using Web Cryptography. Zero image bytes leave your machine."
    },
    {
      id: "best-shot",
      icon: "✨",
      cat: "Images",
      name: "Photo Best-Shot Finder",
      keyword: "Photo Best-Shot Finder",
      desc: "Rank burst photos by sharpness, contrast, and clarity heuristics.",
      seoDesc: "Rank burst photos by sharpness and clarity in your browser. Find the best shot in photo sets locally with total privacy and zero uploads.",
      whatItDoes: "Evaluates bursts of similar photographs using Laplacian-style edge contrast, sharpness, and brightness heuristics to rank pictures from sharpest to blurriest. Helps photographers quickly pick the crispest frame from rapid-fire action burst photography.",
      howToUse: [
        "Select a batch of burst photos taken in similar lighting from your camera roll.",
        "The heuristic engine evaluates edge gradients across 160x160 sample grids in Canvas.",
        "Inspect the ranked gallery showing the sharpest #1 top-rated photo at the top.",
        "Keep the highest-scoring crisp photographs and safely delete blurry candidate shots."
      ],
      limits: "Uses edge-contrast heuristics for sharpness estimation. Does not evaluate aesthetic artistic composition or facial expression smiles.",
      privacy: "Pixel data is analyzed inside local Canvas memory buffers without external API calls or machine learning cloud server uploads."
    },
    {
      id: "photo-timeline",
      icon: "🕒",
      cat: "Images",
      name: "Photo Timeline Builder",
      keyword: "Photo Timeline Builder",
      desc: "Sort photos by file date and generate a standalone offline HTML photo album.",
      seoDesc: "Sort photos by date into standalone HTML albums in your browser. Generate offline chronological photo timelines with zero server uploads.",
      whatItDoes: "Sorts collections of photographs by file modification timestamps and compiles them into a standalone, portable HTML chronological album. Generates an offline gallery timeline that can be archived, emailed, or opened in any browser without needing third-party photo software.",
      howToUse: [
        "Drop a folder or batch of photo files from a family event, wedding, or vacation trip.",
        "The timeline builder automatically orders them chronologically by file timestamp metadata.",
        "Preview the structured chronological event list and picture order on your screen.",
        "Download photo-timeline.html to preserve your standalone offline photo diary."
      ],
      limits: "Reads file system lastModified timestamps. Does not extract EXIF GPS coordinate metadata, camera lens models, or facial recognition tags.",
      privacy: "Album generation runs entirely in client-side JavaScript. Your personal photo libraries and event memories remain completely confidential."
    },
    {
      id: "family-organizer",
      icon: "🗂️",
      cat: "Images",
      name: "Family Photo Date Organizer",
      keyword: "Family Photo Date Organizer",
      desc: "Inspect and group family photos chronologically from file modification timestamps.",
      seoDesc: "Organize family photos chronologically in your browser. Inspect and group picture files by timestamp locally with zero server uploads.",
      whatItDoes: "Inspects batches of family pictures, sorts them chronologically by file date, and exports an offline summary album for simple archiving. Organizes decades of disorganized family pictures into structured yearly and monthly timeline groups.",
      howToUse: [
        "Select multiple family photos from your hard drive or digital camera backup.",
        "The organizer sorts every photo in chronological date order based on file timestamps.",
        "Review the timestamp sequence, chronological dates, and photo groupings on your screen.",
        "Download the formatted HTML photo archive index to keep family albums organized."
      ],
      limits: "Organizes files based on file date attributes. Does not rewrite binary EXIF header tags directly inside raw JPEG image files.",
      privacy: "All photo analysis and document compilation occur inside your local browser sandbox. No family pictures are ever uploaded to external servers."
    }
  ];

  return {
    PARENT_BRAND: PARENT_BRAND,
    PARENT_URL: PARENT_URL,
    SITE_NAME: SITE_NAME,
    SITE_SHORT: SITE_SHORT,
    SITE_URL: SITE_URL,
    SUPPORT_EMAIL: SUPPORT_EMAIL,
    TAGLINE: TAGLINE,
    LOCALE: LOCALE,
    TOOLS: TOOLS
  };
});
