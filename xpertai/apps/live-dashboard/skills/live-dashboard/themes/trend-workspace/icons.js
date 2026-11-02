// Exact SVG output from Lucide React 1.24.0, ISC license in ICON_LICENSE.txt.
// Library icons, not hand-drawn approximations. No runtime React dependency.
const dashboardThemeIcons = {
  "chevronDown": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chevron-down\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m6 9 6 6 6-6\"></path></svg>",
  "check": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-check\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M20 6 9 17l-5-5\"></path></svg>"
};
function dashboardThemeIcon(name) {
  const template = document.createElement('template');
  template.innerHTML = dashboardThemeIcons[name];
  return template.content.firstElementChild.cloneNode(true);
}
