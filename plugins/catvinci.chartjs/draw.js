// A Chart.js configuration drawn on a canvas; an export draws it again
// in the page's colours, on white for paper.
var current = null;

function make(canvas, config, dark) {
  var c = chartColors(dark);
  Chart.defaults.color = c.muted;
  Chart.defaults.borderColor = c.grid;
  // Series without colours of their own take the theme's tones, in order.
  var pie = /^(pie|doughnut|polarArea)$/;
  ((config.data && config.data.datasets) || []).forEach(function (d, i) {
    var round = pie.test(d.type || config.type);
    var tone = c.tones[i % c.tones.length];
    if (d.backgroundColor === undefined) d.backgroundColor = round ? c.tones : tone;
    if (d.borderColor === undefined) d.borderColor = round ? c.bg : tone;
  });
  return new Chart(
    canvas,
    Object.assign({}, config, {
      options: Object.assign(
        { animation: false, responsive: false },
        config.options,
      ),
    }),
  );
}

function canvasFor(el, meta) {
  var canvas = document.createElement("canvas");
  canvas.width = el.clientWidth || 600;
  canvas.height = Number(meta.height) || 300;
  return canvas;
}

drawChartBlock({
  draw: function (el, source, meta, dark) {
    if (current) current.destroy();
    var canvas = canvasFor(el, meta);
    el.replaceChildren(canvas);
    current = make(canvas, parseLoose(source), dark);
  },
  picture: function (el, source, meta, dark) {
    var canvas = canvasFor(el, meta);
    var chart = make(canvas, parseLoose(source), dark);
    var out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    var ctx = out.getContext("2d");
    ctx.fillStyle = chartColors(dark).bg;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    chart.destroy();
    return out.toDataURL("image/png");
  },
});
