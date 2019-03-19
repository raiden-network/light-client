import Vue from 'vue';

Vue.filter('truncate', function(value: string, width: number = 12) {
  const separator = '...';
  if (value.length <= width) {
    return value;
  } else {
    const substWidth = Math.floor(width / 2);
    return (
      value.substr(0, substWidth) +
      separator +
      value.substr(value.length - substWidth)
    );
  }
});

Vue.filter('decimals', function(value: string, decimals: number = 3) {
  return parseFloat(value).toFixed(decimals);
});

Vue.filter('upper', function(value: string) {
  if (!value) {
    return '';
  }
  return value.toLocaleUpperCase();
});
