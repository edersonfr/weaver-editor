function Registry() {
  this.items = {};
}

Registry.prototype.add = function (name, item) {
  this.items[name] = item;
};

Registry.prototype.get = function (name) {
  return this.items[name];
};