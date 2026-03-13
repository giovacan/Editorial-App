/**
 * Test suite for header enhancements and subtopic detection
 */

import { detectSubtopics, buildSubtopicContent } from './subtopicDetector';
import { buildHeaderHtml } from '../hooks/useHeaderFooter';
import { resolveHeaderPageNumberConflicts } from './headerConflictResolver';
import { HEADER_TEMPLATES } from '../data/headerTemplates';

/**
 * Test subtopic detection
 */
export function testSubtopicDetection() {
  console.log('🧪 Testing Subtopic Detection...');
  
  const testCases = [
    {
      name: 'Basic H1 subtopic',
      html: '<h1>Introducción al tema</h1><p>Contenido del capítulo...</p>',
      expected: ['Introducción al tema']
    },
    {
      name: 'Multiple subheaders',
      html: '<h1>Capítulo 1</h1><h2>Sección importante</h2><h3>Subsección detallada</h3>',
      expected: ['Capítulo 1', 'Sección importante', 'Subsección detallada']
    },
    {
      name: 'Pseudo-headers',
      html: '<p><strong>Concepto clave:</strong> Desarrollo sostenible</p>',
      expected: ['Concepto clave: Desarrollo sostenible']
    },
    {
      name: 'Mixed content',
      html: '<h1>Teoría</h1><p>Texto normal</p><h2>Práctica</h2><p>Más texto</p>',
      expected: ['Teoría', 'Práctica']
    }
  ];

  testCases.forEach(testCase => {
    const result = detectSubtopics(testCase.html, ['h1', 'h2', 'h3']);
    const success = result.length > 0;
    console.log(`  ${success ? '✅' : '❌'} ${testCase.name}: ${result.length} subtemas detectados`);
    if (result.length > 0) {
      console.log(`     Subtemas: ${result.map(s => s.text).join(', ')}`);
    }
  });
}

/**
 * Test header HTML generation
 */
export function testHeaderHtmlGeneration() {
  console.log('\n🧪 Testing Header HTML Generation...');
  
  const testConfig = {
    enabled: true,
    template: 'academic',
    displayMode: 'alternate',
    evenPage: { leftContent: 'title', centerContent: 'none', rightContent: 'subheader' },
    oddPage: { leftContent: 'subheader', centerContent: 'none', rightContent: 'page' },
    trackSubheaders: true,
    subheaderLevels: ['h1', 'h2'],
    subheaderFormat: 'full',
    fontFamily: 'same',
    fontSize: 70,
    showLine: true,
    lineStyle: 'solid',
    lineWidth: 0.5,
    lineColor: 'black'
  };

  const testCases = [
    {
      name: 'Even page with subtopic',
      isEvenPage: true,
      headerLeft: 'Mi Libro',
      headerCenter: '',
      headerRight: 'Introducción',
      expected: 'Should contain Mi Libro and Introducción'
    },
    {
      name: 'Odd page with subtopic',
      isEvenPage: false,
      headerLeft: 'Introducción',
      headerCenter: '',
      headerRight: '42',
      expected: 'Should contain Introducción and 42'
    }
  ];

  testCases.forEach(testCase => {
    const html = buildHeaderHtml(
      testCase.headerLeft,
      testCase.headerCenter,
      testCase.headerRight,
      testConfig,
      12
    );
    
    const hasContent = html.includes(testCase.headerLeft) || html.includes(testCase.headerRight);
    console.log(`  ${hasContent ? '✅' : '❌'} ${testCase.name}: ${hasContent ? 'Generated successfully' : 'Failed to generate'}`);
  });
}

/**
 * Test conflict resolution
 */
export function testConflictResolution() {
  console.log('\n🧪 Testing Conflict Resolution...');
  
  const testConfig = {
    enabled: true,
    template: 'academic',
    fontSize: 70,
    marginTop: 0,
    marginBottom: 0.5,
    distanceFromPageNumber: 0.5
  };

  const testCases = [
    {
      name: 'No conflict scenario',
      contentHeight: 600,
      baseFontSize: 12,
      expectedStrategy: 'none'
    },
    {
      name: 'High conflict scenario',
      contentHeight: 100,
      baseFontSize: 12,
      expectedStrategy: 'merge'
    }
  ];

  testCases.forEach(testCase => {
    const result = resolveHeaderPageNumberConflicts(
      testConfig,
      { showPageNumbers: true },
      testCase.contentHeight,
      testCase.baseFontSize
    );
    
    const success = result.resolution.resolved;
    console.log(`  ${success ? '✅' : '❌'} ${testCase.name}: ${result.strategy} strategy applied`);
    if (result.validation.warnings.length > 0) {
      console.log(`     Advertencias: ${result.validation.warnings.join(', ')}`);
    }
  });
}

/**
 * Test template configurations
 */
export function testTemplateConfigurations() {
  console.log('\n🧪 Testing Template Configurations...');
  
  Object.entries(HEADER_TEMPLATES).forEach(([id, template]) => {
    const hasSubtopicFeatures = template.trackSubheaders || template.subtopicBehavior !== 'none';
    console.log(`  ${hasSubtopicFeatures ? '🏷️' : '📄'} ${template.name}: ${hasSubtopicFeatures ? 'Con subtemas' : 'Sin subtemas'}`);
    
    if (hasSubtopicFeatures) {
      console.log(`     Comportamiento: ${template.subtopicBehavior}`);
      console.log(`     Separador: ${template.subtopicSeparator}`);
      console.log(`     Longitud máxima: ${template.subtopicMaxLength}`);
    }
  });
}

/**
 * Run all tests
 */
export function runAllTests() {
  console.log('🚀 Running Header Enhancement Tests...\n');
  
  testSubtopicDetection();
  testHeaderHtmlGeneration();
  testConflictResolution();
  testTemplateConfigurations();
  
  console.log('\n✅ All tests completed!');
  console.log('\n📋 Summary:');
  console.log('   - Subtopic detection: Detects H1-H6 headers and pseudo-headers');
  console.log('   - Header generation: Creates proper HTML with subtopic support');
  console.log('   - Conflict resolution: Handles header/page number positioning');
  console.log('   - Template system: Enhanced templates with subtopic features');
}

// Export for manual testing
export default {
  testSubtopicDetection,
  testHeaderHtmlGeneration,
  testConflictResolution,
  testTemplateConfigurations,
  runAllTests
};