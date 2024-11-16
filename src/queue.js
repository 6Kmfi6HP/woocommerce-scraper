export default class Queue {
  constructor(items) {
    this.items = [...items];
    this.processed = 0;
  }

  next() {
    if (this.items.length === 0) return null;
    this.processed++;
    return this.items.shift();
  }

  size() {
    return this.items.length;
  }
} 