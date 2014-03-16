/* global sector */

sector.Component.define({
  type: 'Alerter',
  initialize: function () {
    this.subscribe('ui.alertRequest', this._alert);
  },
  _alert: function (msg) {
    alert(msg.data);
  }
});

sector.Component.define({
  type: 'HelloWorld',
  ui: { button: 'button' },
  events: { 'button.click': '_handleClick' },
  initialize: function () {
    this.subscribe('ui.routeChanged', this._handleRouteChange);
  },
  _handleClick: function (event) {
    event.preventDefault();
    this.publish('ui.alertRequest', 'Hello World :)');
  },
  _handleRouteChange: function (msg) {
    console.log(msg);
  }
}, sector.mixins.View);

sector.init();