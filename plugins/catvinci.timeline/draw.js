// A timeline drawn as SVG: a line down the left, a dot and a label for
// each "when | what | more" line of the source.
var SVG = "http://www.w3.org/2000/svg";

function node(name, attrs, text) {
  var el = document.createElementNS(SVG, name);
  for (var key in attrs) el.setAttribute(key, attrs[key]);
  if (text) el.textContent = text;
  return el;
}

function timeline(source, width, dark) {
  var events = String(source)
    .split("\n")
    .map(function (line) {
      return line.split("|").map(function (s) {
        return s.trim();
      });
    })
    .filter(function (parts) {
      return parts[0];
    });
  var c = chartColors(dark);
  var ink = c.ink;
  var muted = c.muted;
  var accent = c.tones[0];
  var step = 56;
  var height = Math.max(events.length * step, step);
  var svg = node("svg", {
    xmlns: SVG,
    width: width,
    height: height,
    viewBox: "0 0 " + width + " " + height,
    "font-family": "sans-serif",
  });
  svg.append(
    node("line", {
      x1: 120,
      y1: 12,
      x2: 120,
      y2: height - 12,
      stroke: muted,
      "stroke-width": 2,
    }),
  );
  events.forEach(function (event, i) {
    var y = i * step + 22;
    svg.append(
      node(
        "text",
        {
          x: 104,
          y: y + 5,
          "text-anchor": "end",
          "font-size": 13,
          fill: muted,
        },
        event[0],
      ),
    );
    svg.append(node("circle", { cx: 120, cy: y, r: 6, fill: accent }));
    svg.append(
      node(
        "text",
        { x: 136, y: y + 5, "font-size": 15, "font-weight": 600, fill: ink },
        event[1] || "",
      ),
    );
    if (event[2])
      svg.append(
        node(
          "text",
          { x: 136, y: y + 24, "font-size": 13, fill: muted },
          event[2],
        ),
      );
  });
  return svg;
}

drawChartBlock({
  draw: function (el, source, meta, dark) {
    el.replaceChildren(timeline(source, el.clientWidth || 600, dark));
  },
  picture: function (el, source, meta, dark) {
    return new XMLSerializer().serializeToString(
      timeline(source, el.clientWidth || 600, dark),
    );
  },
});
