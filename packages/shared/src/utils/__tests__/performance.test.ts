import { PerformanceUtils, Monitor, DatabasePerformance, ApiPerformance } from '../performance';

describe('PerformanceUtils', () => {
  beforeEach(() => {
    PerformanceUtils.clearMetrics();
  });

  describe('timer functionality', () => {
    it('should start and end timers correctly', () => {
      PerformanceUtils.startTimer('test-operation');
      
      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Wait for at least 10ms
      }
      
      const duration = PerformanceUtils.endTimer('test-operation');
      
      expect(duration).toBeGreaterThan(0);
      
      const metric = PerformanceUtils.getMetric('test-operation');
      expect(metric).toBeDefined();
      expect(metric!.count).toBe(1);
      expect(metric!.average).toBe(duration);
    });

    it('should handle ending non-existent timer', () => {
      const duration = PerformanceUtils.endTimer('non-existent');
      expect(duration).toBe(0);
    });
  });

  describe('metric recording', () => {
    it('should record metrics correctly', () => {
      PerformanceUtils.recordMetric('test-metric', 100);
      PerformanceUtils.recordMetric('test-metric', 200);
      PerformanceUtils.recordMetric('test-metric', 150);
      
      const metric = PerformanceUtils.getMetric('test-metric');
      
      expect(metric).toBeDefined();
      expect(metric!.count).toBe(3);
      expect(metric!.total).toBe(450);
      expect(metric!.average).toBe(150);
      expect(metric!.min).toBe(100);
      expect(metric!.max).toBe(200);
      expect(metric!.lastValue).toBe(150);
    });

    it('should handle custom units', () => {
      PerformanceUtils.recordMetric('memory-usage', 1024, 'bytes');
      
      const metric = PerformanceUtils.getMetric('memory-usage');
      expect(metric!.unit).toBe('bytes');
    });
  });

  describe('monitoring function execution', () => {
    it('should monitor synchronous functions', () => {
      const testFunction = () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      };

      const result = PerformanceUtils.monitor('sync-test', testFunction);
      
      expect(result).toBe(499500); // Sum of 0 to 999
      
      const metric = PerformanceUtils.getMetric('sync-test');
      expect(metric).toBeDefined();
      expect(metric!.count).toBe(1);
    });

    it('should monitor asynchronous functions', async () => {
      const testFunction = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-result';
      };

      const result = await PerformanceUtils.monitor('async-test', testFunction);
      
      expect(result).toBe('async-result');
      
      const metric = PerformanceUtils.getMetric('async-test');
      expect(metric).toBeDefined();
      expect(metric!.count).toBe(1);
      expect(metric!.average).toBeGreaterThan(5); // Should be at least 10ms
    });

    it('should handle function errors', async () => {
      const errorFunction = async () => {
        throw new Error('Test error');
      };

      await expect(
        PerformanceUtils.monitor('error-test', errorFunction)
      ).rejects.toThrow('Test error');
      
      const metric = PerformanceUtils.getMetric('error-test');
      const errorMetric = PerformanceUtils.getMetric('error-test_error');
      
      expect(metric).toBeDefined();
      expect(errorMetric).toBeDefined();
      expect(errorMetric!.count).toBe(1);
    });
  });

  describe('system information', () => {
    it('should return system performance info', () => {
      const systemInfo = PerformanceUtils.getSystemInfo();
      
      expect(systemInfo).toHaveProperty('memory');
      expect(systemInfo).toHaveProperty('cpu');
      expect(systemInfo).toHaveProperty('uptime');
      expect(systemInfo).toHaveProperty('nodeVersion');
      expect(systemInfo).toHaveProperty('platform');
      expect(systemInfo).toHaveProperty('arch');
      
      expect(systemInfo.memory.heapUsed).toBeGreaterThan(0);
      expect(systemInfo.uptime).toBeGreaterThan(0);
    });
  });

  describe('performance report', () => {
    it('should create comprehensive performance report', () => {
      // Add some test metrics
      PerformanceUtils.recordMetric('api_response_time', 150);
      PerformanceUtils.recordMetric('api_response_time', 200);
      PerformanceUtils.recordMetric('db_query_time', 50);
      PerformanceUtils.recordMetric('api_error', 1, 'count');
      
      const report = PerformanceUtils.createReport();
      
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('systemInfo');
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('recommendations');
      
      expect(report.metrics).toHaveLength(3);
      expect(report.summary.totalOperations).toBe(3);
      expect(report.summary.totalErrors).toBe(1);
    });

    it('should generate appropriate recommendations', () => {
      // Add metrics that should trigger recommendations
      PerformanceUtils.recordMetric('slow_operation', 2000); // Slow operation
      PerformanceUtils.recordMetric('db_query_slow', 1500); // Slow DB query
      PerformanceUtils.recordMetric('operation_error', 15, 'count'); // High error count
      
      const report = PerformanceUtils.createReport();
      
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.includes('slow'))).toBe(true);
    });
  });

  describe('metric cleanup', () => {
    it('should clear all metrics', () => {
      PerformanceUtils.recordMetric('test1', 100);
      PerformanceUtils.recordMetric('test2', 200);
      
      expect(PerformanceUtils.getAllMetrics()).toHaveLength(2);
      
      PerformanceUtils.clearMetrics();
      
      expect(PerformanceUtils.getAllMetrics()).toHaveLength(0);
    });
  });
});

describe('Monitor decorator', () => {
  class TestClass {
    @Monitor('decorated-method')
    testMethod(value: number): number {
      return value * 2;
    }

    @Monitor()
    async asyncMethod(delay: number): Promise<string> {
      await new Promise(resolve => setTimeout(resolve, delay));
      return 'completed';
    }
  }

  beforeEach(() => {
    PerformanceUtils.clearMetrics();
  });

  it('should monitor decorated methods', () => {
    const instance = new TestClass();
    const result = instance.testMethod(5);
    
    expect(result).toBe(10);
    
    const metric = PerformanceUtils.getMetric('decorated-method');
    expect(metric).toBeDefined();
    expect(metric!.count).toBe(1);
  });

  it('should monitor async decorated methods', async () => {
    const instance = new TestClass();
    const result = await instance.asyncMethod(10);
    
    expect(result).toBe('completed');
    
    const metric = PerformanceUtils.getMetric('TestClass.asyncMethod');
    expect(metric).toBeDefined();
    expect(metric!.count).toBe(1);
    expect(metric!.average).toBeGreaterThan(5);
  });
});

describe('DatabasePerformance', () => {
  beforeEach(() => {
    PerformanceUtils.clearMetrics();
  });

  it('should monitor database queries', async () => {
    const mockQuery = jest.fn().mockResolvedValue({ rows: [{ id: 1 }] });
    
    const result = await DatabasePerformance.monitorQuery('test-query', mockQuery);
    
    expect(result).toEqual({ rows: [{ id: 1 }] });
    expect(mockQuery).toHaveBeenCalled();
    
    const metric = PerformanceUtils.getMetric('db_query_test-query');
    const successMetric = PerformanceUtils.getMetric('db_query_test-query_success');
    
    expect(metric).toBeDefined();
    expect(successMetric).toBeDefined();
    expect(successMetric!.count).toBe(1);
  });

  it('should handle database query errors', async () => {
    const mockQuery = jest.fn().mockRejectedValue(new Error('Database error'));
    
    await expect(
      DatabasePerformance.monitorQuery('error-query', mockQuery)
    ).rejects.toThrow('Database error');
    
    const metric = PerformanceUtils.getMetric('db_query_error-query');
    const errorMetric = PerformanceUtils.getMetric('db_query_error-query_error');
    
    expect(metric).toBeDefined();
    expect(errorMetric).toBeDefined();
    expect(errorMetric!.count).toBe(1);
  });

  it('should record connection pool metrics', () => {
    const poolStats = {
      totalCount: 10,
      idleCount: 5,
      waitingCount: 2
    };
    
    DatabasePerformance.recordConnectionMetrics(poolStats);
    
    expect(PerformanceUtils.getMetric('db_pool_total')!.lastValue).toBe(10);
    expect(PerformanceUtils.getMetric('db_pool_idle')!.lastValue).toBe(5);
    expect(PerformanceUtils.getMetric('db_pool_waiting')!.lastValue).toBe(2);
  });
});

describe('ApiPerformance', () => {
  beforeEach(() => {
    PerformanceUtils.clearMetrics();
  });

  it('should record rate limit metrics', () => {
    ApiPerformance.recordRateLimitMetrics('test-endpoint', 80, 100);
    
    const remainingMetric = PerformanceUtils.getMetric('rate_limit_test-endpoint_remaining');
    const usageMetric = PerformanceUtils.getMetric('rate_limit_test-endpoint_usage');
    
    expect(remainingMetric!.lastValue).toBe(80);
    expect(usageMetric!.lastValue).toBe(20);
  });

  it('should monitor API endpoints', (done) => {
    const req = {
      method: 'GET',
      route: { path: '/test' },
      path: '/test'
    };
    
    const res = {
      statusCode: 200,
      end: jest.fn()
    };
    
    const next = jest.fn();
    
    // Mock the middleware
    ApiPerformance.monitorEndpoint(req, res, next);
    
    // Simulate response end after some time
    setTimeout(() => {
      res.end();
      
      const metric = PerformanceUtils.getMetric('api_GET_/test');
      const statusMetric = PerformanceUtils.getMetric('api_GET_/test_200');
      
      expect(metric).toBeDefined();
      expect(statusMetric).toBeDefined();
      expect(statusMetric!.count).toBe(1);
      
      done();
    }, 10);
  });
});