import Vue from 'vue';

Vue.filter('truncate', function(value: string) {
  const toShow = 12;
  const separator = '...';
  if (value.length <= toShow) {
    return value;
  } else {
    return (
      value.substr(0, toShow / 2) +
      separator +
      value.substr(value.length - toShow / 2)
    );
  }
});

Vue.filter('decimals', function(value: string, decimals: number = 3) {
  return parseFloat(value).toFixed(decimals);
});
