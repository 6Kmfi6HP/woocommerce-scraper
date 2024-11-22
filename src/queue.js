/**
 * 任务队列类，用于管理待处理的URL
 */
export default class Queue {
  constructor(items) {
    this.items = [...items];
    this.processed = 0;
    this.failed = 0;
    this.startTime = Date.now();
  }

  /**
   * 获取下一个待处理项
   * @returns {string|null} 下一个URL，如果队列为空则返回null
   */
  next() {
    if (this.items.length === 0) return null;
    this.processed++;
    return this.items.shift();
  }

  /**
   * 记录失败的任务
   */
  recordFailure() {
    this.failed++;
  }

  /**
   * 获取队列当前大小
   * @returns {number} 剩余项数量
   */
  size() {
    return this.items.length;
  }

  /**
   * 获取任务处理统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const endTime = Date.now();
    const duration = (endTime - this.startTime) / 1000; // 转换为秒
    return {
      total: this.processed + this.size(),
      processed: this.processed,
      remaining: this.size(),
      failed: this.failed,
      duration: duration.toFixed(2),
      successRate: ((this.processed - this.failed) / this.processed * 100).toFixed(2) + '%'
    };
  }
}