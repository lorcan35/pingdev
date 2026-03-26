function shouldUseDirectPath(payload) {
  return Array.isArray(payload?.tools) && payload.tools.length > 0;
}

module.exports = {
  shouldUseDirectPath,
};
