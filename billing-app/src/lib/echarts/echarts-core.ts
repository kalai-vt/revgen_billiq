// Single registration point for the ECharts modules this app actually uses.
// Importing from `echarts/core` + selective charts/components (instead of the
// full `echarts` barrel) keeps the tree-shaken bundle small — the full package
// is ~1MB minified, most of it map/graph/3D chart types this app never renders.
import * as echarts from 'echarts/core';
import {
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  TreemapChart,
  FunnelChart,
  GaugeChart,
} from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  TitleComponent,
  VisualMapComponent,
  ToolboxComponent,
  MarkPointComponent,
  MarkLineComponent,
  GraphicComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ComposeOption } from 'echarts/core';
import type {
  BarSeriesOption,
  LineSeriesOption,
  PieSeriesOption,
  HeatmapSeriesOption,
  TreemapSeriesOption,
  FunnelSeriesOption,
  GaugeSeriesOption,
} from 'echarts/charts';
import type {
  GridComponentOption,
  TooltipComponentOption,
  LegendComponentOption,
  DataZoomComponentOption,
  TitleComponentOption,
  VisualMapComponentOption,
  ToolboxComponentOption,
  GraphicComponentOption,
} from 'echarts/components';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  TreemapChart,
  FunnelChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  TitleComponent,
  VisualMapComponent,
  ToolboxComponent,
  MarkPointComponent,
  MarkLineComponent,
  GraphicComponent,
  CanvasRenderer,
]);

export type EChartsOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | HeatmapSeriesOption
  | TreemapSeriesOption
  | FunnelSeriesOption
  | GaugeSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
  | TitleComponentOption
  | VisualMapComponentOption
  | ToolboxComponentOption
  | GraphicComponentOption
>;

export default echarts;
