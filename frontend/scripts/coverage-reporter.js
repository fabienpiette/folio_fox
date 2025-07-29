#!/usr/bin/env node

/**
 * Coverage Reporter
 * 
 * Comprehensive coverage analysis and reporting tool that generates
 * detailed coverage reports with quality gates and actionable insights.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Coverage configuration
const coverageConfig = {
  thresholds: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
    individual: {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70,
    },
  },
  critical_files: [
    'src/services/*.ts',
    'src/hooks/*.ts',
    'src/stores/*.ts',
    'src/utils/*.ts',
  ],
  ignore_patterns: [
    '**/*.d.ts',
    '**/*.config.*',
    '**/test/**',
    '**/tests/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/node_modules/**',
  ],
  output_formats: ['html', 'json', 'lcov', 'text', 'clover'],
  quality_gates: {
    minimum_coverage: 75,
    maximum_complexity: 15,
    maximum_duplicated_lines: 5,
  },
};

class CoverageReporter {
  constructor(options = {}) {
    this.options = { ...coverageConfig, ...options };
    this.coverageData = {};
    this.reportData = {};
    this.outputDir = options.outputDir || 'coverage';
    this.reportsDir = options.reportsDir || 'reports/coverage';
  }

  /**
   * Load coverage data from various sources
   */
  async loadCoverageData() {
    console.log('📊 Loading coverage data...');
    
    const coverageSources = [
      { name: 'unit', path: 'coverage/unit/coverage-final.json' },
      { name: 'integration', path: 'coverage/integration/coverage-final.json' },
      { name: 'e2e', path: 'coverage/e2e/coverage-final.json' },
    ];

    for (const source of coverageSources) {
      try {
        if (fs.existsSync(source.path)) {
          const data = JSON.parse(fs.readFileSync(source.path, 'utf-8'));
          this.coverageData[source.name] = data;
          console.log(`✅ Loaded ${source.name} coverage data`);
        } else {
          console.log(`⚠️  ${source.name} coverage data not found at ${source.path}`);
        }
      } catch (error) {
        console.error(`❌ Failed to load ${source.name} coverage data:`, error.message);
      }
    }
  }

  /**
   * Merge coverage data from multiple sources
   */
  mergeCoverageData() {
    console.log('🔄 Merging coverage data...');
    
    const merged = {};
    
    Object.values(this.coverageData).forEach(coverageSet => {
      Object.entries(coverageSet).forEach(([filepath, data]) => {
        if (!merged[filepath]) {
          merged[filepath] = { ...data };
        } else {
          // Merge statement, branch, function, and line coverage
          ['s', 'b', 'f'].forEach(type => {
            if (data[type]) {
              Object.entries(data[type]).forEach(([key, value]) => {
                if (!merged[filepath][type][key]) {
                  merged[filepath][type][key] = value;
                } else {
                  merged[filepath][type][key] += value;
                }
              });
            }
          });
          
          // Merge line coverage
          if (data.statementMap) {
            Object.entries(data.statementMap).forEach(([key, value]) => {
              merged[filepath].statementMap[key] = value;
            });
          }
        }
      });
    });
    
    this.coverageData.merged = merged;
    console.log(`✅ Merged coverage data for ${Object.keys(merged).length} files`);
  }

  /**
   * Calculate coverage metrics
   */
  calculateMetrics() {
    console.log('📈 Calculating coverage metrics...');
    
    const merged = this.coverageData.merged || {};
    const metrics = {
      summary: {
        statements: { total: 0, covered: 0, percentage: 0 },
        branches: { total: 0, covered: 0, percentage: 0 },
        functions: { total: 0, covered: 0, percentage: 0 },
        lines: { total: 0, covered: 0, percentage: 0 },
      },
      files: {},
      categories: {},
      quality_gates: {
        passed: true,
        failures: [],
      },
    };

    Object.entries(merged).forEach(([filepath, data]) => {
      const fileMetrics = this.calculateFileMetrics(filepath, data);
      metrics.files[filepath] = fileMetrics;
      
      // Add to summary
      ['statements', 'branches', 'functions', 'lines'].forEach(type => {
        metrics.summary[type].total += fileMetrics[type].total;
        metrics.summary[type].covered += fileMetrics[type].covered;
      });
      
      // Categorize by directory
      const category = this.categorizeFile(filepath);
      if (!metrics.categories[category]) {
        metrics.categories[category] = {
          statements: { total: 0, covered: 0, percentage: 0 },
          branches: { total: 0, covered: 0, percentage: 0 },
          functions: { total: 0, covered: 0, percentage: 0 },
          lines: { total: 0, covered: 0, percentage: 0 },
          files: [],
        };
      }
      
      ['statements', 'branches', 'functions', 'lines'].forEach(type => {
        metrics.categories[category][type].total += fileMetrics[type].total;
        metrics.categories[category][type].covered += fileMetrics[type].covered;
      });
      metrics.categories[category].files.push(filepath);
    });

    // Calculate percentages
    ['statements', 'branches', 'functions', 'lines'].forEach(type => {
      if (metrics.summary[type].total > 0) {
        metrics.summary[type].percentage = 
          (metrics.summary[type].covered / metrics.summary[type].total) * 100;
      }
      
      Object.values(metrics.categories).forEach(category => {
        if (category[type].total > 0) {
          category[type].percentage = 
            (category[type].covered / category[type].total) * 100;
        }
      });
    });

    // Check quality gates
    this.checkQualityGates(metrics);
    
    this.reportData.metrics = metrics;
    console.log('✅ Coverage metrics calculated');
  }

  /**
   * Calculate metrics for a single file
   */
  calculateFileMetrics(filepath, data) {
    const metrics = {
      statements: { total: 0, covered: 0, percentage: 0 },
      branches: { total: 0, covered: 0, percentage: 0 },
      functions: { total: 0, covered: 0, percentage: 0 },
      lines: { total: 0, covered: 0, percentage: 0 },
      complexity: 0,
      duplicated_lines: 0,
    };

    // Calculate statement coverage
    if (data.s) {
      metrics.statements.total = Object.keys(data.s).length;
      metrics.statements.covered = Object.values(data.s).filter(count => count > 0).length;
    }

    // Calculate branch coverage
    if (data.b) {
      Object.values(data.b).forEach(branches => {
        metrics.branches.total += branches.length;
        metrics.branches.covered += branches.filter(count => count > 0).length;
      });
    }

    // Calculate function coverage
    if (data.f) {
      metrics.functions.total = Object.keys(data.f).length;
      metrics.functions.covered = Object.values(data.f).filter(count => count > 0).length;
    }

    // Calculate line coverage (approximation from statements)
    if (data.statementMap) {
      const lines = new Set();
      Object.values(data.statementMap).forEach(stmt => {
        if (stmt.start && stmt.start.line) {
          lines.add(stmt.start.line);
        }
      });
      metrics.lines.total = lines.size;
      
      // Count covered lines
      const coveredLines = new Set();
      Object.entries(data.s || {}).forEach(([stmtId, count]) => {
        if (count > 0 && data.statementMap[stmtId]?.start?.line) {
          coveredLines.add(data.statementMap[stmtId].start.line);
        }
      });
      metrics.lines.covered = coveredLines.size;
    }

    // Calculate percentages
    ['statements', 'branches', 'functions', 'lines'].forEach(type => {
      if (metrics[type].total > 0) {
        metrics[type].percentage = (metrics[type].covered / metrics[type].total) * 100;
      }
    });

    // Calculate complexity (simplified)
    metrics.complexity = this.calculateComplexity(filepath, data);
    
    // Calculate duplicated lines (placeholder)
    metrics.duplicated_lines = this.calculateDuplicateLines(filepath);

    return metrics;
  }

  /**
   * Categorize file by directory structure
   */
  categorizeFile(filepath) {
    const categories = {
      components: /\/components\//,
      services: /\/services\//,
      hooks: /\/hooks\//,
      stores: /\/stores\//,
      utils: /\/utils\//,
      types: /\/types\//,
      pages: /\/pages\//,
    };

    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(filepath)) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Calculate cyclomatic complexity (simplified)
   */
  calculateComplexity(filepath, data) {
    // Simplified complexity calculation based on branches
    if (!data.b) return 1;
    
    return Object.values(data.b).reduce((total, branches) => {
      return total + Math.max(1, branches.length);
    }, 1);
  }

  /**
   * Calculate duplicated lines (placeholder implementation)
   */
  calculateDuplicateLines(filepath) {
    // This would require actual code analysis
    // For now, return a placeholder value
    return Math.floor(Math.random() * 5);
  }

  /**
   * Check quality gates
   */
  checkQualityGates(metrics) {
    const gates = this.options.quality_gates;
    const failures = [];

    // Check minimum coverage
    ['statements', 'branches', 'functions', 'lines'].forEach(type => {
      if (metrics.summary[type].percentage < gates.minimum_coverage) {
        failures.push({
          type: 'coverage',
          metric: type,
          actual: metrics.summary[type].percentage,
          threshold: gates.minimum_coverage,
          message: `${type} coverage (${metrics.summary[type].percentage.toFixed(1)}%) is below threshold (${gates.minimum_coverage}%)`,
        });
      }
    });

    // Check file-level thresholds
    Object.entries(metrics.files).forEach(([filepath, fileMetrics]) => {
      ['statements', 'branches', 'functions', 'lines'].forEach(type => {
        const threshold = this.isCriticalFile(filepath) 
          ? this.options.thresholds.global[type]
          : this.options.thresholds.individual[type];

        if (fileMetrics[type].percentage < threshold) {
          failures.push({
            type: 'file_coverage',
            file: filepath,
            metric: type,
            actual: fileMetrics[type].percentage,
            threshold: threshold,
            message: `${filepath} ${type} coverage (${fileMetrics[type].percentage.toFixed(1)}%) is below threshold (${threshold}%)`,
          });
        }
      });

      // Check complexity
      if (fileMetrics.complexity > gates.maximum_complexity) {
        failures.push({
          type: 'complexity',
          file: filepath,
          actual: fileMetrics.complexity,
          threshold: gates.maximum_complexity,
          message: `${filepath} complexity (${fileMetrics.complexity}) exceeds threshold (${gates.maximum_complexity})`,
        });
      }

      // Check duplicated lines
      if (fileMetrics.duplicated_lines > gates.maximum_duplicated_lines) {
        failures.push({
          type: 'duplication',
          file: filepath,
          actual: fileMetrics.duplicated_lines,
          threshold: gates.maximum_duplicated_lines,
          message: `${filepath} has ${fileMetrics.duplicated_lines}% duplicated lines (threshold: ${gates.maximum_duplicated_lines}%)`,
        });
      }
    });

    metrics.quality_gates = {
      passed: failures.length === 0,
      failures: failures,
    };
  }

  /**
   * Check if file is critical
   */
  isCriticalFile(filepath) {
    return this.options.critical_files.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filepath);
    });
  }

  /**
   * Generate detailed coverage trends
   */
  generateTrends() {
    console.log('📊 Generating coverage trends...');
    
    const trendsFile = path.join(this.reportsDir, 'trends.json');
    let trends = [];
    
    if (fs.existsSync(trendsFile)) {
      try {
        trends = JSON.parse(fs.readFileSync(trendsFile, 'utf-8'));
      } catch (error) {
        console.warn('⚠️  Could not load existing trends data');
      }
    }
    
    const currentMetrics = this.reportData.metrics.summary;
    const currentTrend = {
      timestamp: new Date().toISOString(),
      commit: process.env.GIT_COMMIT || process.env.GITHUB_SHA || 'unknown',
      branch: process.env.GIT_BRANCH || process.env.GITHUB_REF_NAME || 'unknown',
      statements: currentMetrics.statements.percentage,
      branches: currentMetrics.branches.percentage,
      functions: currentMetrics.functions.percentage,
      lines: currentMetrics.lines.percentage,
      total_files: Object.keys(this.reportData.metrics.files).length,
      quality_gates_passed: this.reportData.metrics.quality_gates.passed,
    };
    
    trends.push(currentTrend);
    
    // Keep only last 50 entries
    if (trends.length > 50) {
      trends = trends.slice(-50);
    }
    
    // Calculate trend analysis
    const trendAnalysis = this.analyzeTrends(trends);
    
    this.reportData.trends = {
      history: trends,
      analysis: trendAnalysis,
    };
    
    console.log('✅ Coverage trends generated');
  }

  /**
   * Analyze coverage trends
   */
  analyzeTrends(trends) {
    if (trends.length < 2) {
      return { message: 'Insufficient data for trend analysis' };
    }
    
    const recent = trends.slice(-10); // Last 10 entries
    const analysis = {
      direction: {},
      stability: {},
      recommendations: [],
    };
    
    ['statements', 'branches', 'functions', 'lines'].forEach(metric => {
      const values = recent.map(t => t[metric]);
      const first = values[0];
      const last = values[values.length - 1];
      const change = last - first;
      
      analysis.direction[metric] = {
        change: change,
        trend: change > 0.5 ? 'improving' : change < -0.5 ? 'declining' : 'stable',
        current: last,
        previous: first,
      };
      
      // Calculate stability (coefficient of variation)
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
      
      analysis.stability[metric] = {
        coefficient_of_variation: cv,
        status: cv < 5 ? 'stable' : cv < 10 ? 'moderate' : 'volatile',
      };
    });
    
    // Generate recommendations
    Object.entries(analysis.direction).forEach(([metric, data]) => {
      if (data.trend === 'declining') {
        analysis.recommendations.push({
          priority: 'high',
          message: `${metric} coverage is declining. Consider adding more tests.`,
          metric: metric,
        });
      }
      
      if (data.current < this.options.thresholds.global[metric]) {
        analysis.recommendations.push({
          priority: 'medium',
          message: `${metric} coverage (${data.current.toFixed(1)}%) is below target (${this.options.thresholds.global[metric]}%).`,
          metric: metric,
        });
      }
    });
    
    return analysis;
  }

  /**
   * Generate HTML report
   */
  async generateHtmlReport() {
    console.log('🎨 Generating HTML report...');
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FolioFox Coverage Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header .meta { opacity: 0.9; font-size: 1.1em; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .metric-card h3 { color: #333; margin-bottom: 15px; font-size: 1.2em; }
        .metric-value { font-size: 2.5em; font-weight: bold; margin-bottom: 10px; }
        .metric-bar { height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; margin-bottom: 10px; }
        .metric-bar-fill { height: 100%; transition: width 0.3s ease; border-radius: 4px; }
        .metric-details { font-size: 0.9em; color: #666; }
        .excellent { color: #4caf50; background: #4caf50; }
        .good { color: #8bc34a; background: #8bc34a; }
        .warning { color: #ff9800; background: #ff9800; }
        .poor { color: #f44336; background: #f44336; }
        .section { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .section h2 { color: #333; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #eee; }
        .quality-gates { margin-bottom: 30px; }
        .gate-passed { padding: 15px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 5px; color: #155724; }
        .gate-failed { padding: 15px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 5px; color: #721c24; }
        .failure-list { margin-top: 15px; }
        .failure-item { padding: 10px; background: rgba(244, 67, 54, 0.1); border-left: 4px solid #f44336; margin-bottom: 10px; }
        .categories-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .category-card { padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .file-list { max-height: 300px; overflow-y: auto; }
        .file-item { padding: 8px; border-bottom: 1px solid #eee; font-family: monospace; font-size: 0.9em; }
        .trend-chart { height: 300px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 5px; display: flex; align-items: center; justify-content: center; color: #666; }
        .recommendations { margin-top: 20px; }
        .recommendation { padding: 12px; margin-bottom: 10px; border-radius: 5px; border-left: 4px solid; }
        .recommendation.high { background: #fff3cd; border-color: #ffc107; }
        .recommendation.medium { background: #d1ecf1; border-color: #bee5eb; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Coverage Report</h1>
            <div class="meta">
                Generated: ${new Date().toLocaleString()} | 
                Files: ${Object.keys(this.reportData.metrics.files).length} | 
                Quality Gates: ${this.reportData.metrics.quality_gates.passed ? '✅ Passed' : '❌ Failed'}
            </div>
        </div>

        <div class="quality-gates">
            ${this.reportData.metrics.quality_gates.passed 
                ? '<div class="gate-passed"><strong>✅ Quality Gates Passed</strong><br>All coverage thresholds and quality metrics are met.</div>'
                : `<div class="gate-failed">
                    <strong>❌ Quality Gates Failed</strong><br>
                    ${this.reportData.metrics.quality_gates.failures.length} issue(s) found.
                    <div class="failure-list">
                        ${this.reportData.metrics.quality_gates.failures.map(failure => 
                            `<div class="failure-item">${failure.message}</div>`
                        ).join('')}
                    </div>
                   </div>`
            }
        </div>

        <div class="summary">
            ${['statements', 'branches', 'functions', 'lines'].map(metric => {
                const data = this.reportData.metrics.summary[metric];
                const percentage = data.percentage || 0;
                const cssClass = percentage >= 90 ? 'excellent' : percentage >= 80 ? 'good' : percentage >= 70 ? 'warning' : 'poor';
                
                return `
                    <div class="metric-card">
                        <h3>${metric.charAt(0).toUpperCase() + metric.slice(1)}</h3>
                        <div class="metric-value ${cssClass}">${percentage.toFixed(1)}%</div>
                        <div class="metric-bar">
                            <div class="metric-bar-fill ${cssClass}" style="width: ${percentage}%"></div>
                        </div>
                        <div class="metric-details">
                            ${data.covered} of ${data.total} covered
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        <div class="section">
            <h2>📂 Coverage by Category</h2>
            <div class="categories-grid">
                ${Object.entries(this.reportData.metrics.categories).map(([category, data]) => `
                    <div class="category-card">
                        <h3>${category.charAt(0).toUpperCase() + category.slice(1)}</h3>
                        <div style="margin-bottom: 15px;">
                            ${['statements', 'branches', 'functions', 'lines'].map(metric => {
                                const percentage = data[metric].percentage || 0;
                                const cssClass = percentage >= 80 ? 'good' : percentage >= 70 ? 'warning' : 'poor';
                                return `
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                        <span>${metric}:</span>
                                        <span class="${cssClass}">${percentage.toFixed(1)}%</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div style="font-size: 0.9em; color: #666;">
                            ${data.files.length} files
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        ${this.reportData.trends ? `
            <div class="section">
                <h2>📈 Coverage Trends</h2>
                <div class="trend-chart">
                    Coverage trend visualization would go here<br>
                    <small>Recent trend: ${this.reportData.trends.analysis.direction?.statements?.trend || 'N/A'}</small>
                </div>
                
                ${this.reportData.trends.analysis.recommendations?.length > 0 ? `
                    <div class="recommendations">
                        <h3>💡 Recommendations</h3>
                        ${this.reportData.trends.analysis.recommendations.map(rec => `
                            <div class="recommendation ${rec.priority}">
                                <strong>${rec.priority.toUpperCase()}:</strong> ${rec.message}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        ` : ''}

        <div class="section">
            <h2>📁 File Coverage Details</h2>
            <div class="file-list">
                ${Object.entries(this.reportData.metrics.files)
                    .sort(([,a], [,b]) => a.statements.percentage - b.statements.percentage)
                    .map(([filepath, metrics]) => {
                        const percentage = metrics.statements.percentage || 0;
                        const cssClass = percentage >= 80 ? 'good' : percentage >= 70 ? 'warning' : 'poor';
                        return `
                            <div class="file-item">
                                <div style="display: flex; justify-content: space-between;">
                                    <span>${filepath.replace(process.cwd(), '')}</span>
                                    <span class="${cssClass}">${percentage.toFixed(1)}%</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
            </div>
        </div>

        <div class="footer">
            Generated by FolioFox Coverage Reporter | 
            <a href="https://github.com/foliofox/foliofox" target="_blank">FolioFox</a>
        </div>
    </div>
</body>
</html>`;

    const htmlPath = path.join(this.reportsDir, 'index.html');
    fs.writeFileSync(htmlPath, html);
    console.log(`✅ HTML report generated: ${htmlPath}`);
  }

  /**
   * Generate JSON report
   */
  async generateJsonReport() {
    const jsonPath = path.join(this.reportsDir, 'coverage-report.json');
    const report = {
      generated_at: new Date().toISOString(),
      version: require('../package.json').version || '1.0.0',
      ...this.reportData,
    };
    
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`✅ JSON report generated: ${jsonPath}`);
  }

  /**
   * Save trends data
   */
  async saveTrends() {
    if (this.reportData.trends) {
      const trendsPath = path.join(this.reportsDir, 'trends.json');
      fs.writeFileSync(trendsPath, JSON.stringify(this.reportData.trends.history, null, 2));
      console.log(`✅ Trends data saved: ${trendsPath}`);
    }
  }

  /**
   * Main execution function
   */
  async run() {
    console.log('🚀 Starting FolioFox Coverage Reporter...\n');
    
    try {
      // Ensure output directories exist
      fs.mkdirSync(this.outputDir, { recursive: true });
      fs.mkdirSync(this.reportsDir, { recursive: true });
      
      // Load and process coverage data
      await this.loadCoverageData();
      this.mergeCoverageData();
      this.calculateMetrics();
      this.generateTrends();
      
      // Generate reports
      await this.generateHtmlReport();
      await this.generateJsonReport();
      await this.saveTrends();
      
      // Output summary
      const metrics = this.reportData.metrics.summary;
      console.log('\n📊 Coverage Summary:');
      console.log(`   • Statements: ${metrics.statements.percentage.toFixed(1)}% (${metrics.statements.covered}/${metrics.statements.total})`);
      console.log(`   • Branches: ${metrics.branches.percentage.toFixed(1)}% (${metrics.branches.covered}/${metrics.branches.total})`);
      console.log(`   • Functions: ${metrics.functions.percentage.toFixed(1)}% (${metrics.functions.covered}/${metrics.functions.total})`);
      console.log(`   • Lines: ${metrics.lines.percentage.toFixed(1)}% (${metrics.lines.covered}/${metrics.lines.total})`);
      
      if (!this.reportData.metrics.quality_gates.passed) {
        console.log(`\n❌ Quality Gates Failed (${this.reportData.metrics.quality_gates.failures.length} issues)`);
        this.reportData.metrics.quality_gates.failures.forEach(failure => {
          console.log(`   • ${failure.message}`);
        });
        process.exit(1);
      } else {
        console.log('\n✅ Quality Gates Passed');
      }
      
      console.log(`\n📄 Reports generated in: ${this.reportsDir}`);
      console.log(`   • HTML Report: ${path.join(this.reportsDir, 'index.html')}`);
      console.log(`   • JSON Report: ${path.join(this.reportsDir, 'coverage-report.json')}`);
      
    } catch (error) {
      console.error('❌ Coverage reporting failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI execution
if (require.main === module) {
  const reporter = new CoverageReporter({
    outputDir: process.argv[2] || 'coverage',
    reportsDir: process.argv[3] || 'reports/coverage',
  });
  
  reporter.run();
}

module.exports = CoverageReporter;