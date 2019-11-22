<template>
  <svg
    width="110px"
    height="110px"
    viewBox="0 0 110 110"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
  >
    <defs>
      <linearGradient
        id="linearGradient-1"
        x1="-59.3619792%"
        y1="50%"
        x2="206.183811%"
        y2="50%"
      >
        <stop stop-color="#313030" offset="0%"></stop>
        <stop stop-color="#000000" offset="100%"></stop>
      </linearGradient>
      <rect id="path-2" x="0" y="0" width="620" height="620" rx="10"></rect>
      <filter
        id="filter-3"
        x="-2.8%"
        y="-2.8%"
        width="108.9%"
        height="108.9%"
        filterUnits="objectBoundingBox"
      >
        <feOffset
          dx="10"
          dy="10"
          in="SourceAlpha"
          result="shadowOffsetOuter1"
        ></feOffset>
        <feGaussianBlur
          stdDeviation="7.5"
          in="shadowOffsetOuter1"
          result="shadowBlurOuter1"
        ></feGaussianBlur>
        <feColorMatrix
          values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.3 0"
          type="matrix"
          in="shadowBlurOuter1"
        ></feColorMatrix>
      </filter>
      <polygon id="path-4" points="0 0 66.88 0 66.88 48.4 0 48.4"></polygon>
    </defs>
    <g
      id="Layouts"
      stroke="none"
      stroke-width="1"
      fill="none"
      fill-rule="evenodd"
    >
      <g id="stepper/4" transform="translate(-672.000000, -444.000000)">
        <g id="Check" transform="translate(672.000000, 444.000000)">
          <circle id="Oval" fill="#50D2F5" cx="55" cy="55" r="55"></circle>
          <g id="Group-3" transform="translate(22.000000, 30.800000)">
            <mask id="mask-5" fill="white">
              <use xlink:href="#path-4"></use>
            </mask>
            <g id="Clip-2"></g>
            <path
              id="Fill-1"
              d="M23.8173501,35.5257075 C29.2409545,30.0797659 34.4861535,24.7990115 39.7470941,19.5339701 C45.6792749,13.5968986 51.6134739,7.66264743 57.5714871,1.75216707 C59.4867214,-0.147486301 62.1167881,-0.515330103 64.2019515,0.711487396 C66.31658,1.95562941 67.4080011,4.45237425 66.6277803,6.75250598 C66.2984165,7.72509627 65.6578524,8.68237653 64.9264711,9.41564676 C52.6495975,21.7265287 40.344066,34.0092079 28.0240038,46.2773829 C25.1618486,49.1270644 22.2916208,49.0988617 19.4205858,46.2443455 C13.5162556,40.3737518 7.61152178,34.5031581 1.75764561,28.5830082 C-0.217326203,26.5850483 -0.485741541,24.3445452 0.740492743,22.1576271 C1.90618221,20.0782823 4.2569355,18.8752356 6.53584227,19.5883611 C7.80889787,19.9868249 9.04118664,20.8627203 10.0151509,21.8079136 C14.5887061,26.2470188 19.0661968,30.7848334 23.8173501,35.5257075"
              fill="#FFFFFF"
              mask="url(#mask-5)"
            ></path>
          </g>
        </g>
      </g>
    </g>
  </svg>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class Checkmark extends Vue {}
</script>
