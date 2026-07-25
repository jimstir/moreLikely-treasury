"use client";

import { useEffect, useState, useRef } from "react";
import styles from "./PerformanceTracker.module.css";

interface DataPoint {
  date: string;
  value: number;
}

export default function PerformanceTracker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<DataPoint[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; data: DataPoint } | null>(null);

  useEffect(() => {
    // Generate mock historical PnL data
    const mockData: DataPoint[] = [];
    let currentValue = 100000; // Start with $100k
    
    const today = new Date();
    for (let i = 30; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      
      // Random walk
      const change = (Math.random() - 0.45) * 2000; 
      currentValue += change;
      
      mockData.push({
        date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value: currentValue,
      });
    }
    
    setData(mockData);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 20, right: 20, bottom: 30, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const values = data.map((d) => d.value);
    const minVal = Math.min(...values) * 0.95; // 5% padding bottom
    const maxVal = Math.max(...values) * 1.05; // 5% padding top
    const valRange = maxVal - minVal;

    const getX = (index: number) => padding.left + (index / (data.length - 1)) * chartWidth;
    const getY = (val: number) => padding.top + chartHeight - ((val - minVal) / valRange) * chartHeight;

    // Draw grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (i / 4) * chartHeight;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      
      // Y-axis labels
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.font = "10px Inter";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const val = maxVal - (i / 4) * valRange;
      ctx.fillText(`$${(val / 1000).toFixed(1)}k`, padding.left - 10, y);
    }
    ctx.stroke();

    // Draw X-axis labels
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    [0, Math.floor(data.length / 2), data.length - 1].forEach((index) => {
      ctx.fillText(data[index].date, getX(index), height - padding.bottom + 10);
    });

    // Draw area under line
    ctx.beginPath();
    ctx.moveTo(getX(0), height - padding.bottom);
    data.forEach((d, i) => {
      ctx.lineTo(getX(i), getY(d.value));
    });
    ctx.lineTo(getX(data.length - 1), height - padding.bottom);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    
    // Determine color based on overall performance
    const isPositive = data[data.length - 1].value >= data[0].value;
    const baseColor = isPositive ? "16, 185, 129" : "244, 63, 94"; // Emerald or Rose
    
    gradient.addColorStop(0, `rgba(${baseColor}, 0.2)`);
    gradient.addColorStop(1, `rgba(${baseColor}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    data.forEach((d, i) => {
      if (i === 0) ctx.moveTo(getX(i), getY(d.value));
      else ctx.lineTo(getX(i), getY(d.value));
    });
    ctx.strokeStyle = `rgb(${baseColor})`;
    ctx.lineWidth = 2;
    
    // Add glow
    ctx.shadowColor = `rgba(${baseColor}, 0.5)`;
    ctx.shadowBlur = 10;
    ctx.stroke();
    
    // Reset shadow
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

  }, [data]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || data.length === 0) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    const padding = { top: 20, right: 20, bottom: 30, left: 60 };
    const chartWidth = rect.width - padding.left - padding.right;
    
    // Find closest index
    const relativeX = Math.max(0, Math.min(x - padding.left, chartWidth));
    const percentage = relativeX / chartWidth;
    let index = Math.round(percentage * (data.length - 1));
    
    // Fallbacks bounds
    index = Math.max(0, Math.min(index, data.length - 1));
    
    const point = data[index];
    
    const values = data.map((d) => d.value);
    const minVal = Math.min(...values) * 0.95;
    const maxVal = Math.max(...values) * 1.05;
    const valRange = maxVal - minVal;
    
    const pointX = padding.left + (index / (data.length - 1)) * chartWidth;
    const pointY = padding.top + (rect.height - padding.top - padding.bottom) - ((point.value - minVal) / valRange) * (rect.height - padding.top - padding.bottom);

    setHoveredPoint({ x: pointX, y: pointY, data: point });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  const currentVal = data.length > 0 ? data[data.length - 1].value : 0;
  const startVal = data.length > 0 ? data[0].value : 0;
  const percentChange = startVal > 0 ? ((currentVal - startVal) / startVal) * 100 : 0;
  const isPositive = percentChange >= 0;

  return (
    <div className={`glass-card ${styles.wrapper}`}>
      <div className={styles.header}>
        <div>
          <h3>Performance</h3>
          <p className={styles.subtitle}>30-Day Historical PnL</p>
        </div>
        <div className={styles.stats}>
          <span className={styles.currentValue}>
            ${currentVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className={`badge ${isPositive ? 'badge-success' : 'badge-danger'}`}>
            {isPositive ? '+' : ''}{percentChange.toFixed(2)}%
          </span>
        </div>
      </div>
      
      <div className={styles.chartContainer}>
        <canvas 
          ref={canvasRef} 
          className={styles.canvas}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        
        {hoveredPoint && (
          <>
            <div 
              className={styles.tooltipLine} 
              style={{ left: hoveredPoint.x }} 
            />
            <div 
              className={styles.tooltip}
              style={{ 
                left: hoveredPoint.x, 
                top: Math.max(hoveredPoint.y - 40, 10),
                transform: `translateX(${hoveredPoint.x > 300 ? '-110%' : '10%'})`
              }}
            >
              <div className={styles.tooltipDate}>{hoveredPoint.data.date}</div>
              <div className={styles.tooltipValue}>
                ${hoveredPoint.data.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div 
              className={styles.pointDot}
              style={{ 
                left: hoveredPoint.x, 
                top: hoveredPoint.y,
                background: isPositive ? 'var(--accent-emerald)' : 'var(--accent-rose)'
              }} 
            />
          </>
        )}
      </div>
    </div>
  );
}
