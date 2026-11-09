/* preview-brief: landing */
/* preview-vertical: saas */
/* preview-product: subscription-billing */

document.addEventListener("DOMContentLoaded", () => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("js-ready");

  const animated = document.querySelectorAll("[data-animate]");
  if (animated.length) {
    if (reduce) {
      animated.forEach((el) => el.classList.add("is-visible"));
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
      );
      animated.forEach((el) => observer.observe(el));
    }
  }

  initStudioTabs();
});

function initStudioTabs() {
  const section = document.getElementById("studio");
  if (!section) return;

  const tabs = section.querySelectorAll('[role="tab"]');
  const shots = section.querySelectorAll(".studio-shot");
  if (!tabs.length || !shots.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      if (!target) return;

      tabs.forEach((t) => {
        const isActive = t === tab;
        t.classList.toggle("is-active", isActive);
        t.setAttribute("aria-selected", String(isActive));

        let indicator = t.querySelector(".surfaces__tab-indicator");
        if (isActive && !indicator) {
          indicator = document.createElement("span");
          indicator.className = "surfaces__tab-indicator";
          indicator.setAttribute("aria-hidden", "true");
          t.insertBefore(indicator, t.firstChild);
        } else if (!isActive && indicator) {
          indicator.remove();
        }
      });

      shots.forEach((shot) => {
        shot.classList.toggle("is-active", shot.dataset.shot === target);
      });
    });
  });
}
