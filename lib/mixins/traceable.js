var utils = require('../utils');

module.exports = function Traceable() {
  if (!console) { return; }

  this.defaults = utils.defaults({}, this.defaults, { debug: false });

  this.trace = function (message, data) {
    if (this.debug) {
      console.log(this + ' ' + message, data);
    }
  };

  this.after('initialize', function (options) {
    this.trace('initialized', options);
  });

  this.after('destroy', function () {
    this.trace('destroyed');
  });
};