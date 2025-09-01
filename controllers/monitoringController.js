const si = require("systeminformation");
const mongoose = require("mongoose");

// Utility to collect system + DB monitoring data
const getMonitoringDataForSocket = async () => {
  try {
    const cpuData = await si.cpu();
    const memData = await si.mem();
    const fsSizeData = await si.fsSize();

    let dbStats = {};
    if (mongoose.connection.readyState === 1) {
      // Only fetch DB stats if connected
      dbStats = await mongoose.connection.db.stats();
    }

    return {
      cpu: {
        manufacturer: cpuData.manufacturer,
        brand: cpuData.brand,
        speed: cpuData.speed,
        cores: cpuData.cores,
        physicalCores: cpuData.physicalCores,
        load: await si.currentLoad(),
      },
      memory: {
        total: memData.total,
        free: memData.free,
        used: memData.used,
        active: memData.active,
        available: memData.available,
      },
      storage: fsSizeData.map((disk) => ({
        fs: disk.fs,
        type: disk.type,
        size: disk.size,
        used: disk.used,
        available: disk.available,
        use: disk.use,
        mount: disk.mount,
      })),
      database: {
        db: dbStats.db || "N/A",
        collections: dbStats.collections || 0,
        objects: dbStats.objects || 0,
        avgObjSize: dbStats.avgObjSize || 0,
        dataSize: dbStats.dataSize || 0,
        storageSize: dbStats.storageSize || 0,
        totalSize: dbStats.totalSize || 0,
        indexes: dbStats.indexes || 0,
        indexSize: dbStats.indexSize || 0,
      },
      s3: {
        bucketName: process.env.AWS_S3_BUCKET_NAME || "N/A",
        totalSize: "N/A", // Placeholder — integrate AWS SDK if needed
        usedCapacity: "N/A",
        dailyDownload: "N/A",
      },
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Error building monitoring data:", err);
    return { error: "Failed to collect monitoring data" };
  }
};

// Express route handler
const getMonitoringData = async (req, res) => {
  try {
    const data = await getMonitoringDataForSocket();
    if (data.error) {
      return res.status(500).json(data);
    }
    res.status(200).json(data);
  } catch (err) {
    console.error("Error fetching monitoring data:", err);
    res.status(500).json({ error: "Failed to fetch monitoring data" });
  }
};

module.exports = {
  getMonitoringData,          // For Express route
  getMonitoringDataForSocket, // For Socket.IO or other uses
};
