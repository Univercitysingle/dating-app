import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
} from 'chart.js';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title
);

const MonitoringDashboard = () => {
  const [data, setData] = useState(null);
  const [cpuLoadHistory, setCpuLoadHistory] = useState([]);

  useEffect(() => {
    const socket = io('/monitoring', {
      withCredentials: true,
    });

    socket.on('monitoring-data', (newData) => {
      setData(newData);
      setCpuLoadHistory(prevHistory => {
        const newHistory = [...prevHistory, newData.cpu.load.currentLoad];
        return newHistory.length > 20 ? newHistory.slice(1) : newHistory;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!data) {
    return <div>Loading monitoring data...</div>;
  }

  const memoryChartData = {
    labels: ['Used', 'Free'],
    datasets: [
      {
        data: [data.memory.used, data.memory.free],
        backgroundColor: ['#FF6384', '#36A2EB'],
        hoverBackgroundColor: ['#FF6384', '#36A2EB'],
      },
    ],
  };

  const cpuLoadChartData = {
    labels: cpuLoadHistory.map((_, index) => index + 1),
    datasets: [
      {
        label: 'CPU Load (%)',
        data: cpuLoadHistory,
        fill: false,
        borderColor: '#FF6384',
      },
    ],
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Real-time Monitoring Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* CPU Info */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">CPU</h2>
          <p><strong>Brand:</strong> {data.cpu.brand}</p>
          <p><strong>Speed:</strong> {data.cpu.speed} GHz</p>
          <p><strong>Cores:</strong> {data.cpu.cores}</p>
          <div style={{ height: '200px' }}>
            <Line data={cpuLoadChartData} options={{ maintainAspectRatio: false }} />
          </div>
        </div>

        {/* Memory Info */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">Memory</h2>
          <div style={{ height: '200px' }}>
            <Doughnut data={memoryChartData} options={{ maintainAspectRatio: false }} />
          </div>
        </div>

        {/* Storage Info */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">Storage</h2>
          {data.storage.map((disk, index) => (
            <div key={index} className="mb-2">
              <p><strong>Mount:</strong> {disk.mount}</p>
              <div style={{ height: '150px' }}>
                <Doughnut
                  data={{
                    labels: ['Used', 'Available'],
                    datasets: [
                      {
                        data: [disk.used, disk.available],
                        backgroundColor: ['#FFCE56', '#4BC0C0'],
                        hoverBackgroundColor: ['#FFCE56', '#4BC0C0'],
                      },
                    ],
                  }}
                  options={{ maintainAspectRatio: false }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Database Info */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">Database</h2>
          <p><strong>Name:</strong> {data.database.db}</p>
          <p><strong>Collections:</strong> {data.database.collections}</p>
          <p><strong>Total Size:</strong> {(data.database.totalSize / 1e6).toFixed(2)} MB</p>
        </div>

        {/* S3 Info */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">S3 Bucket</h2>
          <p><strong>Bucket Name:</strong> {data.s3.bucketName}</p>
          <p><strong>Total Size:</strong> {data.s3.totalSize}</p>
          <p><strong>Daily Download:</strong> {data.s3.dailyDownload}</p>
        </div>
      </div>
    </div>
  );
};

export default MonitoringDashboard;
