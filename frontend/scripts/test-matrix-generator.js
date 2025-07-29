#!/usr/bin/env node

/**
 * Test Matrix Generator
 * 
 * Generates comprehensive test matrices for browsers, devices, 
 * operating systems, and edge cases for systematic testing coverage.
 */

const fs = require('fs');
const path = require('path');

// Test matrix configuration
const testMatrix = {
  browsers: [
    {
      name: 'Chrome',
      versions: ['latest', 'latest-1', 'latest-2'],
      engine: 'chromium',
      capabilities: ['webgl', 'css-grid', 'es2020', 'webassembly'],
      market_share: 65.2,
    },
    {
      name: 'Firefox',
      versions: ['latest', 'latest-1', 'esr'],
      engine: 'gecko',
      capabilities: ['webgl', 'css-grid', 'es2020', 'webassembly'],
      market_share: 3.2,
    },
    {
      name: 'Safari',
      versions: ['latest', 'latest-1'],
      engine: 'webkit',
      capabilities: ['webgl', 'css-grid', 'es2020', 'webassembly'],
      market_share: 18.8,
      limitations: ['limited-webgl', 'webkit-specific-bugs'],
    },
    {
      name: 'Edge',
      versions: ['latest', 'latest-1'],
      engine: 'chromium',
      capabilities: ['webgl', 'css-grid', 'es2020', 'webassembly'],
      market_share: 4.1,
    },
    {
      name: 'Opera',
      versions: ['latest'],
      engine: 'chromium',
      capabilities: ['webgl', 'css-grid', 'es2020', 'webassembly'],
      market_share: 2.4,
    }
  ],

  devices: [
    // Desktop devices
    {
      category: 'desktop',
      name: 'Desktop 1920x1080',
      viewport: { width: 1920, height: 1080 },
      pixel_ratio: 1,
      touch: false,
      market_share: 22.5,
    },
    {
      category: 'desktop',
      name: 'Desktop 1366x768',
      viewport: { width: 1366, height: 768 },
      pixel_ratio: 1,
      touch: false,
      market_share: 15.2,
    },
    {
      category: 'desktop',
      name: 'Desktop 4K',
      viewport: { width: 3840, height: 2160 },
      pixel_ratio: 2,
      touch: false,
      market_share: 3.1,
    },

    // Tablet devices
    {
      category: 'tablet',
      name: 'iPad',
      viewport: { width: 820, height: 1180 },
      pixel_ratio: 2,
      touch: true,
      user_agent: 'iPad',
      market_share: 8.4,
    },
    {
      category: 'tablet',
      name: 'iPad Pro',
      viewport: { width: 1024, height: 1366 },
      pixel_ratio: 2,
      touch: true,
      user_agent: 'iPad',
      market_share: 2.1,
    },
    {
      category: 'tablet',
      name: 'Android Tablet',
      viewport: { width: 800, height: 1280 },
      pixel_ratio: 2,
      touch: true,
      user_agent: 'Android',
      market_share: 3.8,
    },

    // Mobile devices
    {
      category: 'mobile',
      name: 'iPhone 14',
      viewport: { width: 390, height: 844 },
      pixel_ratio: 3,
      touch: true,
      user_agent: 'iPhone',
      market_share: 15.6,
    },
    {
      category: 'mobile',
      name: 'iPhone SE',
      viewport: { width: 375, height: 667 },
      pixel_ratio: 2,
      touch: true,
      user_agent: 'iPhone',
      market_share: 2.8,
    },
    {
      category: 'mobile',
      name: 'Samsung Galaxy S23',
      viewport: { width: 384, height: 854 },
      pixel_ratio: 3,
      touch: true,
      user_agent: 'Android',
      market_share: 8.9,
    },
    {
      category: 'mobile',
      name: 'Google Pixel 7',
      viewport: { width: 412, height: 915 },
      pixel_ratio: 2.6,
      touch: true,
      user_agent: 'Android',
      market_share: 1.4,
    }
  ],

  operating_systems: [
    {
      name: 'Windows 11',
      versions: ['22H2', '21H2'],
      market_share: 23.6,
      browsers: ['Chrome', 'Firefox', 'Edge', 'Opera'],
    },
    {
      name: 'Windows 10',
      versions: ['22H2', '21H2', '20H2'],
      market_share: 35.4,
      browsers: ['Chrome', 'Firefox', 'Edge', 'Opera'],
    },
    {
      name: 'macOS',
      versions: ['Ventura', 'Monterey', 'Big Sur'],
      market_share: 15.8,
      browsers: ['Chrome', 'Firefox', 'Safari', 'Edge'],
    },
    {
      name: 'iOS',
      versions: ['16', '15', '14'],
      market_share: 18.2,
      browsers: ['Safari', 'Chrome'],
      limitations: ['webkit-only'],
    },
    {
      name: 'Android',
      versions: ['13', '12', '11', '10'],
      market_share: 41.8,
      browsers: ['Chrome', 'Firefox', 'Samsung Internet'],
    },
    {
      name: 'Linux',
      versions: ['Ubuntu 22.04', 'Fedora 37', 'Debian 11'],
      market_share: 2.1,
      browsers: ['Chrome', 'Firefox'],
    }
  ],

  network_conditions: [
    {
      name: 'Fast 3G',
      download: 1600,
      upload: 750,
      latency: 150,
      description: 'Typical mobile network in good conditions',
    },
    {
      name: 'Slow 3G',
      download: 500,
      upload: 500,
      latency: 400,
      description: 'Poor mobile network conditions',
    },
    {
      name: 'Fast 4G',
      download: 4000,
      upload: 3000,
      latency: 20,
      description: 'Good 4G/LTE connection',
    },
    {
      name: 'Slow 4G',
      download: 1200,
      upload: 1200,
      latency: 100,
      description: 'Congested 4G/LTE connection',
    },
    {
      name: 'WiFi',
      download: 30000,
      upload: 15000,
      latency: 2,
      description: 'Fast WiFi connection',
    },
    {
      name: 'Slow WiFi',
      download: 2000,
      upload: 1000,
      latency: 28,
      description: 'Congested or distant WiFi',
    },
    {
      name: 'Offline',
      download: 0,
      upload: 0,
      latency: 0,
      description: 'No network connection',
    }
  ],

  accessibility_requirements: [
    {
      standard: 'WCAG 2.1 AA',
      tests: [
        'color-contrast',
        'keyboard-navigation',
        'screen-reader-compatibility',
        'focus-management',
        'semantic-markup',
        'alt-text',
        'form-labels',
        'heading-structure',
        'landmark-roles'
      ]
    },
    {
      standard: 'Section 508',
      tests: [
        'keyboard-access',
        'screen-reader-text',
        'color-independence',
        'timing-adjustable',
        'focus-indicators',
        'error-identification'
      ]
    },
    {
      standard: 'ADA Compliance',
      tests: [
        'perceivable-content',
        'operable-interface',
        'understandable-information',
        'robust-compatibility'
      ]
    }
  ],

  edge_cases: [
    {
      category: 'input-validation',
      scenarios: [
        'empty-strings',
        'extremely-long-text',
        'special-characters',
        'unicode-characters',
        'sql-injection-attempts',
        'xss-attempts',
        'malformed-data'
      ]
    },
    {
      category: 'performance',
      scenarios: [
        'large-datasets',
        'concurrent-operations',
        'memory-pressure',
        'slow-networks',
        'high-latency',
        'intermittent-connectivity'
      ]
    },
    {
      category: 'state-management',
      scenarios: [
        'rapid-state-changes',
        'concurrent-modifications',
        'browser-refresh',
        'tab-switching',
        'window-resizing',
        'orientation-change'
      ]
    },
    {
      category: 'error-conditions',
      scenarios: [
        'network-failures',
        'server-errors',
        'timeout-conditions',
        'resource-not-found',
        'permission-denied',
        'quota-exceeded'
      ]
    }
  ]
};

/**
 * Generate Playwright test configurations
 */
function generatePlaywrightConfig() {
  const config = {
    use: {
      headless: true,
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
      trace: 'on-first-retry',
    },
    projects: []
  };

  // Generate browser projects
  testMatrix.browsers.forEach(browser => {
    browser.versions.forEach(version => {
      testMatrix.devices.forEach(device => {
        if (shouldIncludeBrowserDeviceCombination(browser, device)) {
          config.projects.push({
            name: `${browser.name}-${version}-${device.name}`,
            use: {
              browserName: browser.engine,
              viewport: device.viewport,
              deviceScaleFactor: device.pixel_ratio,
              hasTouch: device.touch,
              userAgent: generateUserAgent(browser, device, version),
              locale: 'en-US',
              timezoneId: 'America/New_York',
            },
            testMatch: getTestFilesForBrowserDevice(browser, device),
            retries: getBrowserRetries(browser),
            timeout: getBrowserTimeout(browser),
          });
        }
      });
    });
  });

  // Generate network condition projects
  testMatrix.network_conditions.forEach(network => {
    if (network.name !== 'Offline') { // Offline tests handled separately
      config.projects.push({
        name: `network-${network.name.toLowerCase().replace(/\s+/g, '-')}`,
        use: {
          browserName: 'chromium',
          viewport: { width: 1920, height: 1080 },
          launchOptions: {
            args: [
              `--force-effective-connection-type=${getConnectionType(network)}`,
              `--force-prefers-reduced-motion`
            ]
          }
        },
        testMatch: '**/network/*.spec.ts',
        grep: new RegExp(network.name.replace(/\s+/g, ''), 'i'),
      });
    }
  });

  return config;
}

/**
 * Generate test combinations based on priority and market share
 */
function generateTestCombinations() {
  const combinations = [];

  // High priority combinations (market share > 10%)
  const highPriorityBrowsers = testMatrix.browsers.filter(b => b.market_share > 10);
  const highPriorityDevices = testMatrix.devices.filter(d => d.market_share > 10);

  highPriorityBrowsers.forEach(browser => {
    highPriorityDevices.forEach(device => {
      if (isCompatible(browser, device)) {
        combinations.push({
          priority: 'high',
          browser: browser.name,
          device: device.name,
          frequency: 'every-commit',
          market_coverage: browser.market_share * device.market_share / 100,
        });
      }
    });
  });

  // Medium priority combinations
  const mediumPriorityBrowsers = testMatrix.browsers.filter(b => b.market_share >= 3 && b.market_share <= 10);
  const mediumPriorityDevices = testMatrix.devices.filter(d => d.market_share >= 3 && d.market_share <= 10);

  mediumPriorityBrowsers.forEach(browser => {
    mediumPriorityDevices.forEach(device => {
      if (isCompatible(browser, device)) {
        combinations.push({
          priority: 'medium',
          browser: browser.name,
          device: device.name,
          frequency: 'nightly',
          market_coverage: browser.market_share * device.market_share / 100,
        });
      }
    });
  });

  // Low priority combinations (edge cases and rare configurations)
  const lowPriorityBrowsers = testMatrix.browsers.filter(b => b.market_share < 3);
  const lowPriorityDevices = testMatrix.devices.filter(d => d.market_share < 3);

  lowPriorityBrowsers.forEach(browser => {
    lowPriorityDevices.forEach(device => {
      if (isCompatible(browser, device)) {
        combinations.push({
          priority: 'low',
          browser: browser.name,
          device: device.name,
          frequency: 'weekly',
          market_coverage: browser.market_share * device.market_share / 100,
        });
      }
    });
  });

  return combinations.sort((a, b) => b.market_coverage - a.market_coverage);
}

/**
 * Generate accessibility test matrix
 */
function generateAccessibilityMatrix() {
  const matrix = [];

  testMatrix.accessibility_requirements.forEach(requirement => {
    requirement.tests.forEach(test => {
      // Test across different browsers for accessibility
      ['chromium', 'firefox', 'webkit'].forEach(browser => {
        matrix.push({
          standard: requirement.standard,
          test: test,
          browser: browser,
          viewport: { width: 1920, height: 1080 },
          tools: getAccessibilityTools(test),
        });
      });

      // Test on mobile for touch accessibility
      matrix.push({
        standard: requirement.standard,
        test: test,
        browser: 'webkit',
        viewport: { width: 375, height: 667 },
        touch: true,
        tools: getAccessibilityTools(test),
      });
    });
  });

  return matrix;
}

/**
 * Generate edge case test scenarios
 */
function generateEdgeCaseScenarios() {
  const scenarios = [];

  testMatrix.edge_cases.forEach(category => {
    category.scenarios.forEach(scenario => {
      scenarios.push({
        category: category.category,
        scenario: scenario,
        description: getScenarioDescription(category.category, scenario),
        test_data: generateTestData(category.category, scenario),
        expected_behavior: getExpectedBehavior(category.category, scenario),
        priority: getScenarioPriority(category.category, scenario),
      });
    });
  });

  return scenarios;
}

/**
 * Generate performance test configurations
 */
function generatePerformanceMatrix() {
  return {
    load_tests: [
      {
        name: 'concurrent-users-light',
        users: 10,
        duration: '2m',
        ramp_up: '30s',
        scenarios: ['search', 'browse', 'download'],
      },
      {
        name: 'concurrent-users-medium',
        users: 50,
        duration: '5m',
        ramp_up: '1m',
        scenarios: ['search', 'browse', 'download', 'queue-management'],
      },
      {
        name: 'concurrent-users-heavy',
        users: 100,
        duration: '10m',
        ramp_up: '2m',
        scenarios: ['all'],
      }
    ],
    stress_tests: [
      {
        name: 'memory-pressure',
        scenario: 'large-search-results',
        data_size: '50MB',
        expected_max_memory: '200MB',
      },
      {
        name: 'cpu-intensive',
        scenario: 'complex-filtering',
        operations_per_second: 1000,
        expected_max_cpu: '80%',
      }
    ],
    network_tests: testMatrix.network_conditions.map(network => ({
      name: network.name.toLowerCase().replace(/\s+/g, '-'),
      download: network.download,
      upload: network.upload,
      latency: network.latency,
      scenarios: ['search', 'download', 'real-time-updates'],
    }))
  };
}

// Helper functions
function shouldIncludeBrowserDeviceCombination(browser, device) {
  // iOS only supports WebKit-based browsers
  if (device.user_agent === 'iPhone' && browser.engine !== 'webkit') {
    return false;
  }
  
  // Desktop devices don't need touch-specific mobile browsers
  if (device.category === 'desktop' && browser.name === 'Samsung Internet') {
    return false;
  }
  
  return true;
}

function isCompatible(browser, device) {
  return shouldIncludeBrowserDeviceCombination(browser, device);
}

function generateUserAgent(browser, device, version) {
  const baseUserAgents = {
    'Chrome': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Firefox': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Safari': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Edge': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
  };
  
  let userAgent = baseUserAgents[browser.name] || baseUserAgents['Chrome'];
  
  // Modify for mobile devices
  if (device.category === 'mobile' && device.user_agent === 'iPhone') {
    userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
  } else if (device.category === 'mobile' && device.user_agent === 'Android') {
    userAgent = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  }
  
  return userAgent;
}

function getTestFilesForBrowserDevice(browser, device) {
  const patterns = ['**/*.spec.ts'];
  
  if (device.category === 'mobile') {
    patterns.push('**/mobile/*.spec.ts');
  }
  
  if (browser.limitations && browser.limitations.includes('webkit-specific-bugs')) {
    patterns.push('**/webkit-specific/*.spec.ts');
  }
  
  return patterns;
}

function getBrowserRetries(browser) {
  // Safari tends to be more flaky
  return browser.name === 'Safari' ? 2 : 1;
}

function getBrowserTimeout(browser) {
  // Safari can be slower
  return browser.name === 'Safari' ? 45000 : 30000;
}

function getConnectionType(network) {
  if (network.download >= 10000) return '4g';
  if (network.download >= 1500) return '3g';
  if (network.download >= 500) return 'slow-2g';
  return 'offline';
}

function getAccessibilityTools(test) {
  const toolMap = {
    'color-contrast': ['axe-core', 'color-contrast-analyzer'],
    'keyboard-navigation': ['axe-core', 'keyboard-tester'],
    'screen-reader-compatibility': ['axe-core', 'nvda', 'jaws-simulator'],
    'focus-management': ['axe-core', 'focus-trap-tester'],
    'semantic-markup': ['axe-core', 'html-validator'],
    'alt-text': ['axe-core', 'image-analyzer'],
    'form-labels': ['axe-core', 'form-validator'],
    'heading-structure': ['axe-core', 'heading-analyzer'],
    'landmark-roles': ['axe-core', 'landmark-validator']
  };
  
  return toolMap[test] || ['axe-core'];
}

function getScenarioDescription(category, scenario) {
  const descriptions = {
    'input-validation': {
      'empty-strings': 'Test handling of empty input fields',
      'extremely-long-text': 'Test with input exceeding normal limits',
      'special-characters': 'Test with special characters and symbols',
      'unicode-characters': 'Test with international characters',
      'sql-injection-attempts': 'Test protection against SQL injection',
      'xss-attempts': 'Test protection against XSS attacks',
      'malformed-data': 'Test handling of corrupted or invalid data'
    },
    'performance': {
      'large-datasets': 'Test performance with large amounts of data',
      'concurrent-operations': 'Test multiple simultaneous operations',
      'memory-pressure': 'Test behavior under memory constraints',
      'slow-networks': 'Test performance on slow connections',
      'high-latency': 'Test behavior with network delays',
      'intermittent-connectivity': 'Test handling of connection drops'
    },
    'state-management': {
      'rapid-state-changes': 'Test quick succession of state updates',
      'concurrent-modifications': 'Test simultaneous state changes',
      'browser-refresh': 'Test state persistence across page reloads',
      'tab-switching': 'Test state management with tab changes',
      'window-resizing': 'Test responsive behavior',
      'orientation-change': 'Test mobile orientation changes'
    },
    'error-conditions': {
      'network-failures': 'Test handling of network connectivity issues',
      'server-errors': 'Test response to server error conditions',
      'timeout-conditions': 'Test handling of request timeouts',
      'resource-not-found': 'Test 404 and missing resource scenarios',
      'permission-denied': 'Test unauthorized access scenarios',
      'quota-exceeded': 'Test storage and rate limit scenarios'
    }
  };
  
  return descriptions[category]?.[scenario] || `Test ${scenario} in ${category} category`;
}

function generateTestData(category, scenario) {
  // This would generate appropriate test data for each scenario
  // Simplified for brevity
  return {
    category,
    scenario,
    generated: true
  };
}

function getExpectedBehavior(category, scenario) {
  // Define expected behavior for each scenario
  return `System should handle ${scenario} gracefully without crashes or data loss`;
}

function getScenarioPriority(category, scenario) {
  const highPriorityScenarios = [
    'network-failures', 'empty-strings', 'large-datasets', 
    'browser-refresh', 'server-errors'
  ];
  
  return highPriorityScenarios.includes(scenario) ? 'high' : 'medium';
}

/**
 * Main execution
 */
function main() {
  console.log('🧪 Generating comprehensive test matrix for FolioFox...\n');
  
  const outputDir = path.join(__dirname, '..', 'test-matrices');
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Generate all matrices
  const matrices = {
    playwright_config: generatePlaywrightConfig(),
    test_combinations: generateTestCombinations(),
    accessibility_matrix: generateAccessibilityMatrix(),
    edge_case_scenarios: generateEdgeCaseScenarios(),
    performance_matrix: generatePerformanceMatrix(),
    browser_matrix: testMatrix.browsers,
    device_matrix: testMatrix.devices,
    network_matrix: testMatrix.network_conditions,
    os_matrix: testMatrix.operating_systems,
  };
  
  // Write matrices to files
  Object.entries(matrices).forEach(([name, data]) => {
    const filename = path.join(outputDir, `${name.replace(/_/g, '-')}.json`);
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`✅ Generated ${name}: ${filename}`);
  });
  
  // Generate summary report
  const summary = {
    generated_at: new Date().toISOString(),
    total_browsers: testMatrix.browsers.length,
    total_devices: testMatrix.devices.length,
    total_os: testMatrix.operating_systems.length,
    total_combinations: matrices.test_combinations.length,
    high_priority_combinations: matrices.test_combinations.filter(c => c.priority === 'high').length,
    accessibility_tests: matrices.accessibility_matrix.length,
    edge_case_scenarios: matrices.edge_case_scenarios.length,
    performance_configurations: matrices.performance_matrix.load_tests.length + 
                               matrices.performance_matrix.stress_tests.length + 
                               matrices.performance_matrix.network_tests.length,
    market_coverage: matrices.test_combinations
      .filter(c => c.priority === 'high')
      .reduce((sum, c) => sum + c.market_coverage, 0),
  };
  
  fs.writeFileSync(
    path.join(outputDir, 'summary.json'), 
    JSON.stringify(summary, null, 2)
  );
  
  console.log('\n📊 Test Matrix Summary:');
  console.log(`   • ${summary.total_combinations} test combinations`);
  console.log(`   • ${summary.high_priority_combinations} high-priority combinations`);
  console.log(`   • ${summary.accessibility_tests} accessibility test cases`);
  console.log(`   • ${summary.edge_case_scenarios} edge case scenarios`);
  console.log(`   • ${summary.performance_configurations} performance test configurations`);
  console.log(`   • ${summary.market_coverage.toFixed(1)}% market coverage (high priority)`);
  
  console.log('\n🎯 Generated test matrices in:', outputDir);
  console.log('\nUse these matrices to configure your test runners and ensure comprehensive coverage!');
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  testMatrix,
  generatePlaywrightConfig,
  generateTestCombinations,
  generateAccessibilityMatrix,
  generateEdgeCaseScenarios,
  generatePerformanceMatrix
};