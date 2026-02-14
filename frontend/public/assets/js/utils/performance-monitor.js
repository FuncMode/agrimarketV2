// assets/js/utils/performance-monitor.js
// Performance Monitoring Utility

/**
 * Initialize performance monitoring
 */
export const initPerformanceMonitoring = () => {
  if (!('performance' in window)) {
    return;
  }

  // Monitor page load performance
  window.addEventListener('load', () => {
    // Use setTimeout to ensure all metrics are available
    setTimeout(() => {
      measurePageLoad();
      measureResources();
    }, 0);
  });

  // Monitor long tasks (if supported)
  if ('PerformanceObserver' in window) {
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
        }
      });
      
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // Long task observer not supported
    }
  }
};

/**
 * Measure page load performance
 */
const measurePageLoad = () => {
  const perfData = performance.getEntriesByType('navigation')[0];
  
  if (!perfData) return;

  const metrics = {
    'DNS Lookup': perfData.domainLookupEnd - perfData.domainLookupStart,
    'TCP Connection': perfData.connectEnd - perfData.connectStart,
    'Request Time': perfData.responseStart - perfData.requestStart,
    'Response Time': perfData.responseEnd - perfData.responseStart,
    'DOM Processing': perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
    'Total Load Time': perfData.loadEventEnd - perfData.fetchStart
  };
};

/**
 * Measure resource loading performance
 */
const measureResources = () => {
  const resources = performance.getEntriesByType('resource');
  
  const slowResources = resources
    .filter(r => r.duration > 500)
    .sort((a, b) => b.duration - a.duration);
};

/**
 * Mark performance milestone
 */
export const markPerformance = (name) => {
  if ('performance' in window && performance.mark) {
    performance.mark(name);
  }
};

/**
 * Measure between two marks
 */
export const measurePerformance = (measureName, startMark, endMark) => {
  if ('performance' in window && performance.measure) {
    try {
      performance.measure(measureName, startMark, endMark);
      const measure = performance.getEntriesByName(measureName)[0];
      return measure.duration;
    } catch (e) {
    }
  }
  return null;
};

/**
 * Get current memory usage (if available)
 */
export const getMemoryUsage = () => {
  if (performance.memory) {
    return {
      usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
      totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
      jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
    };
  }
  return null;
};
