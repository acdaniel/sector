var utils = require('../utils');

module.exports = function PubSub () {

  this.publish = function (topic, data) {
    if (this.trace) { this.trace('=>> ' + topic , data); }
    var message = '', parts = topic.split('.'), delim = 'pubsub.';
    var dispatch = function (e) {
      document.dispatchEvent(e);
    };
    for (var i = 0, l = parts.length; i < l; i++) {
      message += delim + parts[i];
      var e = utils.createEvent(message, { topic: topic, data: data });
      utils.defer(dispatch, e);
      delim = '.';
    }
  };

  this.subscribe = function (topic, func) {
    if (this.trace) { this.trace('<<+>> ' + topic); }
    func = utils.isString(func) ? this[func] : func;
    this.listenTo(document, 'pubsub.' + topic, function (e) {
      if (this.trace) { this.trace('<<= ' + e.detail.topic, e.detail.data); }
      func.call(this, {topic: e.detail.topic, data: e.detail.data});
    });
  };

  this.unsubscribe = function (topic) {
    if (this.trace) { this.trace('<<x>> ' + (topic || 'all')); }
    this.stopListening(document, 'pubsub.' + topic);
  };
};