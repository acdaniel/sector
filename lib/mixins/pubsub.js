var utils = require('../utils');

module.exports = function () {

  this.publish = function (topic, data) {
    this.trace && this.trace('=>> ' + topic , data);
    var e = utils.createEvent('pubsub.' + topic,
      { topis: topic, data: data }
    );
    window.document.dispatchEvent(e);
  };

  this.subscribe = function (topic, func) {
    this.trace && this.trace('<<+>> ' + topic);
    func = utils.isString(func) ? this[func] : func;
    this.listenTo(window.document, 'pubsub.' + topic, function (e) {
      this.trace && this.trace('<<= ' + e.detail.topic, e.detail.data);
      func.call(this, {topic: e.detail.topic, data: e.detail.data});
    });
  };

  this.unsubscribe = function (topic) {
    this.trace && this.trace('<<x>> ' + topic);
    this.stopListening(window.document, 'pubsub.' + topic);
  };
};