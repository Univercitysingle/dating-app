// reportWebVitals.js
// This file enables measuring and reporting of web vitals in your React application.
// Web Vitals include metrics like CLS (Cumulative Layout Shift), FID (First Input Delay), LCP (Largest Contentful Paint), etc.
// More info: https://web.dev/vitals/

const reportWebVitals = onPerfEntry => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
    });
  }
};

export default reportWebVitals;
