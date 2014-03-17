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
  handleClick: function () {
    this.publish('ui.alertRequest', 'Hello World :)');
  }
}, sector.mixins.View);

sector.init();