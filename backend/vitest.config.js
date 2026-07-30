module.exports = {
  test: {
    // Backend is plain CommonJS throughout — globals lets test files use
    // describe/it/expect/vi without an ESM import, so they can stay
    // require()-based like the rest of the codebase.
    globals: true,
    environment: 'node',
  },
};
