import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Polyline, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg';

interface MiniChartProps {
  positive: boolean;
  width?: number;
  height?: number;
}

export function MiniChart({ positive, width = 80, height = 32 }: MiniChartProps) {
  const color = positive ? '#0ECB81' : '#F6465D';

  const points = useMemo(() => {
    const count = 12;
    const pts: number[] = [];
    let val = height / 2 + (Math.random() - 0.5) * height * 0.3;
    for (let i = 0; i < count; i++) {
      val += (Math.random() - (positive ? 0.4 : 0.6)) * height * 0.25;
      val = Math.max(4, Math.min(height - 4, val));
      pts.push(val);
    }
    return pts;
  }, [positive, width, height]);

  const polylinePoints = points.map((y, i) => `${(i / (points.length - 1)) * width},${y}`).join(' ');
  const areaPoints = `0,${height} ${polylinePoints} ${width},${height}`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`grad-${positive}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Polygon points={areaPoints} fill={`url(#grad-${positive})`} />
      <Polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
