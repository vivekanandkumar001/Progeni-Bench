/*
 * Header navigation, mega-menu, dropdowns and mobile drawer controller.
 * Loaded with a content-hashed query (?v=...) so cached app.js bundles can
 * never leave header buttons unresponsive after a deploy.
 */
(function () {
  if (typeof document === "undefined" || window.__benchNavBound) return;
  window.__benchNavBound = true;

  function closeNavPanels() {
    document.querySelectorAll(".nav-trigger[aria-expanded='true']").forEach(function (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      var panelId = trigger.getAttribute("aria-controls");
      var panel = panelId ? document.getElementById(panelId) : null;
      if (panel) panel.hidden = true;
    });
  }

  function closeMobileNav(restoreFocus) {
    var nav = document.getElementById("primary-nav");
    var hamburger = document.getElementById("hamburger");
    if (!nav) return;
    var wasOpen = nav.classList.contains("open");
    nav.classList.remove("open");
    document.body.classList.remove("nav-open");
    if (hamburger) hamburger.setAttribute("aria-expanded", "false");
    closeNavPanels();
    if (restoreFocus && wasOpen && hamburger) hamburger.focus();
  }

  function hideSearchSuggestions() {
    var suggestions = document.getElementById("search-suggestions");
    if (suggestions && !suggestions.hidden) {
      suggestions.hidden = true;
      var searchInput = document.getElementById("search");
      if (searchInput) searchInput.setAttribute("aria-expanded", "false");
    }
  }

  function toggleNavPanel(trigger) {
    var panelId = trigger.getAttribute("aria-controls");
    var panel = panelId ? document.getElementById(panelId) : null;
    if (!panel) return;
    var wasOpen = trigger.getAttribute("aria-expanded") === "true";
    closeNavPanels();
    hideSearchSuggestions();
    if (wasOpen) {
      trigger.focus();
      return;
    }
    trigger.setAttribute("aria-expanded", "true");
    panel.hidden = false;
  }

  function bindHeader() {
    if (document.documentElement.dataset.benchHeaderInit === "1") return;
    document.documentElement.dataset.benchHeaderInit = "1";

    document.addEventListener("click", function (e) {
      var trigger = e.target.closest && e.target.closest(".nav-trigger");
      if (trigger) {
        toggleNavPanel(trigger);
        return;
      }

      var onHamburger = !!(e.target.closest && e.target.closest("#hamburger"));
      if (onHamburger) {
        var navEl = document.getElementById("primary-nav");
        var hamburgerEl = document.getElementById("hamburger");
        if (!navEl || !hamburgerEl) return;
        var open = !navEl.classList.contains("open");
        closeNavPanels();
        if (open) hideSearchSuggestions();
        navEl.classList.toggle("open", open);
        document.body.classList.toggle("nav-open", open);
        hamburgerEl.setAttribute("aria-expanded", String(open));
        return;
      }

      var nav = document.getElementById("primary-nav");
      if (nav && nav.contains(e.target)) {
        if (e.target.closest && e.target.closest("a")) {
          closeMobileNav(false);
          closeNavPanels();
        }
        return;
      }

      closeNavPanels();
      if (nav && nav.classList.contains("open")) closeMobileNav(false);
    });

    window.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var openTrigger = document.querySelector(".nav-trigger[aria-expanded='true']");
      if (openTrigger) {
        closeNavPanels();
        openTrigger.focus();
        return;
      }
      closeMobileNav(true);
    });
  }

  window.__benchHeader = {
    closeNavPanels: closeNavPanels,
    closeMobileNav: closeMobileNav,
    toggleNavPanel: toggleNavPanel
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindHeader);
  } else {
    bindHeader();
  }
})();
