/* global sector, alert */

sector.Component.define({
  type: 'Alerter',
  initialize: function () {
    this.subscribe('ui.alertRequest', function (msg) {
      alert(msg.data);
    });
  }
});

sector.Component.define({
  type: 'HelloWorld',
  ui: { button: 'button' },
  events: { 'button.click': 'handleClick' },
  initialize: function () {
    this.subscribe('ui.routeChanged', this.handleRouteChange);
  },
  handleClick: function () {
    this.publish('ui.alertRequest', 'Hello World :)');
  },
  handleRouteChange: function (msg) {
    console.log(msg);
  }
}, sector.mixins.View);

sector.init();