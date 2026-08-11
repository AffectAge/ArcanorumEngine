import * as echarts from "echarts";
import type { EChartsOption, EChartsType } from "echarts";
import { useEffect, useRef, type ReactNode } from "react";

export type GameChartPreviewType = "line" | "bar" | "area" | "donut";

type GameChartPreviewProps = {
  type: GameChartPreviewType;
  title: ReactNode;
  label: string;
  icon?: ReactNode;
};

type ChartPalette = {
  gold: string;
  primaryTop: string;
  primaryBottom: string;
  border: string;
  text: string;
  muted: string;
};

export function GameChartPreview({ type, title, label, icon }: GameChartPreviewProps) {
  const chartElementRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<EChartsType | null>(null);

  useEffect(() => {
    const container = chartElementRef.current;
    if (!container) return;
    const existing = chartInstanceRef.current;
    const chart =
      existing && existing.getDom() === container
        ? existing
        : (() => {
            existing?.dispose();
            return echarts.init(container);
          })();
    chartInstanceRef.current = chart;

    const style = getComputedStyle(container);
    const palette = {
      gold: style.getPropertyValue("--arc-color-gold").trim(),
      primaryTop: style.getPropertyValue("--arc-color-primary-top").trim(),
      primaryBottom: style.getPropertyValue("--arc-color-primary-bottom").trim(),
      border: style.getPropertyValue("--arc-kit-divider").trim(),
      text: style.getPropertyValue("--arc-kit-text").trim(),
      muted: style.getPropertyValue("--arc-kit-text-muted").trim(),
    };
    chart.setOption(buildTemplateChartOption(type, palette));

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [type]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  return (
    <article className="arc-kit-chart-card">
      <div className="arc-kit-chart-card__title">
        {icon}
        <span>{title}</span>
      </div>
      <div className="arc-kit-chart-frame" role="img" aria-label={label}>
        <div ref={chartElementRef} className="arc-kit-chart-echarts" />
      </div>
    </article>
  );
}

function buildTemplateChartOption(type: GameChartPreviewType, palette: ChartPalette): EChartsOption {
  const axis = {
    axisLabel: { show: false, color: palette.muted, fontSize: 10 },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: palette.border } },
  };
  const categoryData = ["I", "II", "III", "IV", "V", "VI"];
  const values = [18, 34, 26, 48, 39, 56];

  if (type === "donut") {
    return {
      animationDuration: 450,
      backgroundColor: "transparent",
      tooltip: { show: false },
      series: [
        {
          type: "pie",
          radius: ["48%", "72%"],
          center: ["50%", "52%"],
          label: { show: false },
          labelLine: { show: false },
          data: [
            { value: 68, name: "A", itemStyle: { color: palette.gold } },
            { value: 16, name: "B", itemStyle: { color: palette.primaryTop } },
            { value: 16, name: "C", itemStyle: { color: palette.border } },
          ],
        },
      ],
      graphic: {
        type: "text",
        left: "center",
        top: "middle",
        style: {
          text: "68%",
          fill: palette.text,
          fontSize: 20,
          fontWeight: 700,
        },
      },
    };
  }

  return {
    animationDuration: 450,
    backgroundColor: "transparent",
    grid: { left: 28, right: 12, top: 12, bottom: 24 },
    tooltip: { show: false },
    xAxis: {
      ...axis,
      type: "category",
      boundaryGap: type !== "line",
      data: categoryData,
    },
    yAxis: {
      ...axis,
      type: "value",
    },
    series: [
      {
        type: type === "bar" ? "bar" : "line",
        data: values,
        smooth: type !== "bar",
        symbol: type === "bar" ? "none" : "circle",
        symbolSize: 5,
        barMaxWidth: 18,
        lineStyle: {
          color: palette.gold,
          width: 3,
        },
        itemStyle: {
          color: type === "bar" ? palette.primaryTop : palette.gold,
        },
        areaStyle:
          type === "area"
            ? {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: palette.primaryTop },
                  { offset: 1, color: palette.primaryBottom },
                ]),
                opacity: 0.28,
              }
            : undefined,
      },
    ],
  };
}
