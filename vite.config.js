export default {
  base: process.env.CI ? '/LD59/' : '/',
  server: {
    host: '0.0.0.0',
    allowedHosts: ['odroid'],
  },
};
