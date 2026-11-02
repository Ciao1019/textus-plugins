// An ECharts option drawn as SVG; an export draws it again for the page.
var chart = null;

/** ECharts' theme made of the window's: tones for the series, the text,
 *  muted and border colours for labels, axes and grid. */
function theme(dark) {
  var c = chartColors(dark);
  var axis = {
    axisLine: { lineStyle: { color: c.muted } },
    axisTick: { lineStyle: { color: c.muted } },
    axisLabel: { color: c.muted },
    splitLine: { lineStyle: { color: [c.grid] } },
  };
  return {
    color: c.tones,
    backgroundColor: "transparent",
    textStyle: { color: c.ink },
    title: { textStyle: { color: c.ink } },
    legend: { textStyle: { color: c.ink } },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    logAxis: axis,
  };
}

function size(el, meta) {
  return { width: el.clientWidth || 600, height: Number(meta.height) || 320 };
}

drawChartBlock({
  draw: function (el, source, meta, dark) {
    var option = parseLoose(source);
    if (chart) chart.dispose();
    el.replaceChildren();
    var box = size(el, meta);
    chart = echarts.init(el, theme(dark), {
      renderer: "svg",
      width: box.width,
      height: box.height,
    });
    chart.setOption(Object.assign({ backgroundColor: "transparent" }, option));
  },
  picture: function (el, source, meta, dark) {
    var box = size(el, meta);
    var paper = echarts.init(null, theme(dark), {
      renderer: "svg",
      ssr: true,
      width: box.width,
      height: box.height,
    });
    paper.setOption(Object.assign({ animation: false }, parseLoose(source)));
    var svg = paper.renderToSVGString();
    paper.dispose();
    return svg;
  },
});
