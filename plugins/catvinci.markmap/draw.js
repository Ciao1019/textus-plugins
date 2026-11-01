// A Markdown outline drawn as a mind map (markmap).
var SVG = "http://www.w3.org/2000/svg";
var transformer = new window.markmap.Transformer();

function mindMap(el, source, meta, dark) {
  var svg = document.createElementNS(SVG, "svg");
  svg.style.width = "100%";
  svg.style.height = (Number(meta.height) || 360) + "px";
  var c = chartColors(dark);
  var seen = new Map();
  svg.style.color = c.ink;
  el.replaceChildren(svg);
  var root = transformer.transform(source).root;
  var map = window.markmap.Markmap.create(
    svg,
    {
      autoFit: true,
      duration: 0,
      // Branches in the theme's tones, in the order they are met, as
      // markmap's own ordinal colours are.
      color: function (node) {
        var key = String((node.state && node.state.path) || "");
        if (!seen.has(key)) seen.set(key, seen.size);
        return c.tones[seen.get(key) % c.tones.length];
      },
    },
    root,
  );
  return map.fit();
}

drawChartBlock({
  draw: mindMap,
  // Drawn again in the export's colours, at a fixed size.
  picture: async function (el, source, meta, dark) {
    var box = document.createElement("div");
    box.style.cssText =
      "position:absolute;left:-10000px;width:" + el.clientWidth + "px";
    document.body.append(box);
    try {
      await mindMap(box, source, meta, dark);
      var svg = box.querySelector("svg");
      svg.setAttribute("xmlns", SVG);
      svg.setAttribute("width", String(el.clientWidth));
      svg.setAttribute("height", String(Number(meta.height) || 360));
      return new XMLSerializer().serializeToString(svg);
    } finally {
      box.remove();
    }
  },
});
