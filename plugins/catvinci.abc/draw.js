// ABC notation engraved as SVG by abcjs.
function engrave(el, source, dark, responsive) {
  el.replaceChildren();
  ABCJS.renderAbc(el, source, {
    responsive: responsive ? "resize" : undefined,
    foregroundColor: chartColors(dark).ink,
  });
}

drawChartBlock({
  draw: function (el, source, meta, dark) {
    engrave(el, source, dark, true);
  },
  // At its own size, so the picture has a width and height.
  picture: function (el, source, meta, dark) {
    var box = document.createElement("div");
    box.style.cssText =
      "position:absolute;left:-10000px;width:" + el.clientWidth + "px";
    document.body.append(box);
    try {
      engrave(box, source, dark, false);
      var svg = box.querySelector("svg");
      if (!svg) return null;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      return new XMLSerializer().serializeToString(svg);
    } finally {
      box.remove();
    }
  },
});
