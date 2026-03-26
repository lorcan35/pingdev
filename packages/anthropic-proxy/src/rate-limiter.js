class SlidingWindowRateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  _prune(now) {
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter((ts) => ts > cutoff);
  }

  nextDelayMs(now = Date.now()) {
    this._prune(now);

    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(now);
      return 0;
    }

    const earliest = this.timestamps[0];
    const delay = Math.max(0, earliest + this.windowMs - now);
    this.timestamps.push(now + delay);
    this.timestamps.sort((a, b) => a - b);
    return delay;
  }
}

module.exports = {
  SlidingWindowRateLimiter,
};
