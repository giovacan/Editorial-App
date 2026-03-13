import { useState, useMemo, useCallback, memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useEditorStore from '../../store/useEditorStore';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import Accordion from '../Accordion/Accordion';
import {
  IconBook,
  IconType,
  IconTitle,
  IconList,
  IconAlignLeft,
  IconQuote,
  IconBookmark,
  IconHash,
} from './icons';
import StructureTab from './StructureTab';
import FormatPanel from './config/FormatPanel';
import TypographyPanel from './config/TypographyPanel';
import TitlePanel from './config/TitlePanel';
import SubheadersPanel from './config/SubheadersPanel';
import ParagraphPanel from './config/ParagraphPanel';
import QuotePanel from './config/QuotePanel';
import HeaderPanel from './config/HeaderPanel';
import PaginationPanel from './config/PaginationPanel';
import './SidebarLeft.css';

function SidebarLeft() {
  const [activeTab, setActiveTab] = useState('structure');

  const chapters = useEditorStore((s) => s.bookData?.chapters);
  const bookType = useEditorStore((s) => s.bookData?.bookType);
  const config = useEditorStore(useShallow((s) => s.config));
  const activeChapterId = useEditorStore((s) => s.editing.activeChapterId);
  const addChapter = useEditorStore((s) => s.addChapter);
  const addSection = useEditorStore((s) => s.addSection);
  const updateChapter = useEditorStore((s) => s.updateChapter);
  const setBookData = useEditorStore((s) => s.setBookData);
  const setConfig = useEditorStore((s) => s.setConfig);
  const getStatsSelector = useEditorStore((s) => s.getStatsSelector);
  const setActiveChapter = useEditorStore((s) => s.setActiveChapter);
  const deleteChapter = useEditorStore((s) => s.deleteChapter);
  const moveChapter = useEditorStore((s) => s.moveChapter);

  const safeBookData = { title: '', author: '', chapters: chapters || [], bookType: bookType || 'novela' };

  const safeConfig = useMemo(() => config || {
    pageFormat: 'a5',
    fontSize: 12,
    lineHeight: 1.6,
    showHeaders: false,
    header: {
      enabled: false,
      template: 'classic',
      displayMode: 'alternate',
      evenPage: { leftContent: 'title', centerContent: 'none', rightContent: 'none' },
      oddPage: { leftContent: 'none', centerContent: 'none', rightContent: 'chapter' },
      trackSubheaders: false,
      trackPseudoHeaders: false,
      subheaderLevels: ['h1', 'h2'],
      subheaderFormat: 'full',
      fontFamily: 'same',
      fontSize: 70,
      showLine: true,
      lineStyle: 'solid',
      lineWidth: 0.5,
      lineColor: 'black',
      marginTop: 0,
      marginBottom: 0.5,
      distanceFromPageNumber: 0.5,
      whenPaginationSamePosition: 'merge',
      skipFirstChapterPage: true
    },
    chapterTitle: { align: 'center', bold: true, sizeMultiplier: 1.8, marginTop: 2, marginBottom: 1, startOnRightPage: true, layout: 'continuous', showLines: false, lineWidth: 0.5, lineStyle: 'solid', lineColor: '#333333', lineWidthTitle: false },
    subheaders: {
      h1: { align: 'center', bold: true, sizeMultiplier: 1.5, marginTop: 1.5, marginBottom: 0.5, minLinesAfter: 2 },
      h2: { align: 'center', bold: true, sizeMultiplier: 1.35, marginTop: 1.25, marginBottom: 0.5, minLinesAfter: 2 },
      h3: { align: 'center', bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 },
      h4: { align: 'left', bold: true, sizeMultiplier: 1.15, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 },
      h5: { align: 'left', bold: true, sizeMultiplier: 1.1, marginTop: 0.75, marginBottom: 0.25, minLinesAfter: 1 },
      h6: { align: 'left', bold: false, sizeMultiplier: 1.0, marginTop: 0.5, marginBottom: 0.25, minLinesAfter: 1 }
    },
    paragraph: { firstLineIndent: 1.5, align: 'justify', spacingBetween: 0 },
    quote: { enabled: true, indentLeft: 2, indentRight: 2, showLine: true, italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1, template: 'classic', autoDetect: true },
    pagination: { minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true }
  }, [config]);

  const stats = useMemo(() => getStatsSelector(), [chapters]);

  // Unit conversion helper
  const convertToUnit = (value, currentUnit, targetUnit) => {
    let valueInInches;
    if (currentUnit === 'mm') valueInInches = value / 25.4;
    else if (currentUnit === 'cm') valueInInches = value / 2.54;
    else valueInInches = value;

    if (targetUnit === 'mm') return valueInInches * 25.4;
    if (targetUnit === 'cm') return valueInInches * 2.54;
    return valueInInches;
  };

  const handleCustomPageUnitChange = (newUnit) => {
    const currentUnit = safeConfig.customPageFormat?.unit || 'in';
    const currentWidth = safeConfig.customPageFormat?.width || 6;
    const currentHeight = safeConfig.customPageFormat?.height || 9;

    setConfig({
      customPageFormat: {
        ...safeConfig.customPageFormat,
        unit: newUnit,
        width: convertToUnit(currentWidth, currentUnit, newUnit),
        height: convertToUnit(currentHeight, currentUnit, newUnit)
      }
    });
  };

  const handleGutterUnitChange = (newUnit) => {
    const currentUnit = safeConfig.gutterUnit || 'in';
    const currentValue = safeConfig.gutterManual || recommendedGutter;

    setConfig({
      gutterUnit: newUnit,
      gutterManual: convertToUnit(currentValue, currentUnit, newUnit)
    });
  };

  const recommendedGutter = useMemo(() => {
    const pageCount = stats?.pages || 0;
    return KDP_STANDARDS.getDynamicGutter(safeConfig.pageFormat, safeBookData.bookType, pageCount);
  }, [stats?.pages, safeConfig.pageFormat, safeBookData.bookType]);

  const recommendedGutterInUnit = useMemo(() => {
    const unit = safeConfig.gutterUnit || 'in';
    if (unit === 'mm') return recommendedGutter * 25.4;
    if (unit === 'cm') return recommendedGutter * 2.54;
    return recommendedGutter;
  }, [recommendedGutter, safeConfig.gutterUnit]);

  const handleGutterStrategyChange = (strategy) => {
    if (strategy === 'custom') {
      setConfig({
        gutterStrategy: 'custom',
        gutterManual: recommendedGutterInUnit
      });
    } else {
      setConfig({ gutterStrategy: strategy });
    }
  };

  const handleBookTypeChange = useCallback((e) => {
    const bookConfig = KDP_STANDARDS.getBookTypeConfig(e.target.value);
    setBookData({ bookType: e.target.value });
    setConfig({
      pageFormat: bookConfig.recommendedFormat,
      fontSize: bookConfig.fontSize,
      lineHeight: bookConfig.lineHeight
    });
  }, [setBookData, setConfig]);

  // Structure tab handlers
  const handleAddChapter = useCallback(() => {
    const title = prompt('Título del capítulo:');
    if (title) {
      addChapter(title);
    }
  }, [addChapter]);

  const handleAddSection = useCallback(() => {
    const title = prompt('Nombre de la sección (ej: Prólogo, Dedicatoria):');
    if (title) {
      addSection(title);
    }
  }, [addSection]);

  const handleTitleChange = useCallback((chapterId, newTitle) => {
    updateChapter(chapterId, { title: newTitle });
  }, [updateChapter]);

  const handleDocumentTitleChange = (e) => {
    setBookData({ title: e.target.value });
  };

  const handleDocumentAuthorChange = (e) => {
    setBookData({ author: e.target.value });
  };

  // Create stable config reference for accordion memoization
  const stableConfigHash = useMemo(() => JSON.stringify({
    pageFormat: safeConfig.pageFormat,
    customPageFormat: safeConfig.customPageFormat,
    gutterStrategy: safeConfig.gutterStrategy,
    gutterManual: safeConfig.gutterManual,
    gutterUnit: safeConfig.gutterUnit,
    fontSize: safeConfig.fontSize,
    lineHeight: safeConfig.lineHeight,
    chapterTitle: safeConfig.chapterTitle,
    subheaders: safeConfig.subheaders,
    paragraph: safeConfig.paragraph,
    quote: safeConfig.quote,
    pagination: safeConfig.pagination,
    header: safeConfig.header,
    fontFamily: safeConfig.fontFamily
  }), [
    safeConfig.pageFormat,
    safeConfig.customPageFormat,
    safeConfig.gutterStrategy,
    safeConfig.gutterManual,
    safeConfig.gutterUnit,
    safeConfig.fontSize,
    safeConfig.lineHeight,
    safeConfig.chapterTitle,
    safeConfig.subheaders,
    safeConfig.paragraph,
    safeConfig.quote,
    safeConfig.pagination,
    safeConfig.header,
    safeConfig.fontFamily
  ]);

  const accordionItems = useMemo(() => [
    {
      id: 'formato',
      title: 'Formato del Libro',
      icon: <IconBook />,
      content: (
        <FormatPanel
          safeConfig={safeConfig}
          safeBookData={safeBookData}
          stats={stats}
          setConfig={setConfig}
          onBookTypeChange={handleBookTypeChange}
          recommendedGutter={recommendedGutter}
          recommendedGutterInUnit={recommendedGutterInUnit}
          onCustomPageUnitChange={handleCustomPageUnitChange}
          onGutterStrategyChange={handleGutterStrategyChange}
          onGutterUnitChange={handleGutterUnitChange}
        />
      )
    },
    {
      id: 'tipografia',
      title: 'Tipografía Base',
      icon: <IconType />,
      content: (
        <TypographyPanel
          safeConfig={safeConfig}
          setConfig={setConfig}
        />
      )
    },
    {
      id: 'formato-capitulo',
      title: 'Formato de Títulos',
      icon: <IconTitle />,
      content: (
        <TitlePanel
          safeConfig={safeConfig}
          config={config}
          chapters={chapters}
          setConfig={setConfig}
          setBookData={setBookData}
        />
      )
    },
    {
      id: 'subheaders',
      title: 'Subencabezados (H1-H6)',
      icon: <IconList />,
      content: (
        <SubheadersPanel
          safeConfig={safeConfig}
          config={config}
          chapters={chapters}
          setConfig={setConfig}
          updateChapter={updateChapter}
        />
      )
    },
    {
      id: 'parrafos',
      title: 'Párrafos',
      icon: <IconAlignLeft />,
      content: (
        <ParagraphPanel
          safeConfig={safeConfig}
          config={config}
          setConfig={setConfig}
        />
      )
    },
    {
      id: 'citas',
      title: 'Citas',
      icon: <IconQuote />,
      content: (
        <QuotePanel
          safeConfig={safeConfig}
          config={config}
          chapters={chapters}
          setConfig={setConfig}
        />
      )
    },
    {
      id: 'headers',
      title: 'Encabezados (Headers)',
      icon: <IconBookmark />,
      content: (
        <HeaderPanel
          safeConfig={safeConfig}
          setConfig={setConfig}
        />
      )
    },
    {
      id: 'paginas',
      title: 'Números de Página',
      icon: <IconHash />,
      content: (
        <>
          <fieldset className="config-group">
            <legend>Mostrar</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.showPageNumbers} onChange={(e) => setConfig({ showPageNumbers: e.target.checked })} />
              Mostrar números de página
            </label>
          </fieldset>

          {safeConfig.showPageNumbers && (
            <>
              <fieldset className="config-group">
                <legend>Posición</legend>
                <select value={safeConfig.pageNumberPos} onChange={(e) => setConfig({ pageNumberPos: e.target.value })}>
                  <option value="top">Arriba</option>
                  <option value="bottom">Abajo</option>
                </select>
              </fieldset>

              <fieldset className="config-group">
                <legend>Alineación</legend>
                <select value={safeConfig.pageNumberAlign} onChange={(e) => setConfig({ pageNumberAlign: e.target.value })}>
                  <option value="paragraph-edge">Borde del párrafo</option>
                  <option value="paragraph">12px del párrafo</option>
                  <option value="outer">Borde exterior</option>
                  <option value="center">Centro</option>
                </select>
              </fieldset>

              <fieldset className="config-group">
                <legend>Distancia al borde</legend>
                <div className="number-row">
                  <input
                    type="number"
                    min="4" max="24" step="2"
                    value={safeConfig.pageNumberMargin ?? 12}
                    onChange={(e) => setConfig({ pageNumberMargin: parseInt(e.target.value) })}
                  />
                  <span>px</span>
                </div>
              </fieldset>
            </>
          )}
        </>
      )
    },
    {
      id: 'paginacion',
      title: 'Reglas de Paginación',
      icon: <IconTitle />,
      content: (
        <PaginationPanel
          safeConfig={safeConfig}
          config={config}
          setConfig={setConfig}
        />
      )
    }
  ], [stableConfigHash, safeBookData?.bookType, handleBookTypeChange, setConfig]);

  return (
    <aside className="sidebar sidebar-left" role="complementary" aria-label="Panel de estructura y configuración">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'structure' ? 'active' : ''}`}
          onClick={() => setActiveTab('structure')}
          aria-selected={activeTab === 'structure'}
        >
          Estructura
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
          aria-selected={activeTab === 'config'}
        >
          Configuración
        </button>
      </div>

      {activeTab === 'structure' && (
        <StructureTab
          bookData={safeBookData}
          activeChapterId={activeChapterId}
          stats={stats}
          onTitleChange={handleDocumentTitleChange}
          onAuthorChange={handleDocumentAuthorChange}
          onAddChapter={handleAddChapter}
          onAddSection={handleAddSection}
          onSelectChapter={setActiveChapter}
          onDeleteChapter={deleteChapter}
          onMoveChapter={moveChapter}
          onChapterTitleChange={handleTitleChange}
        />
      )}

      {activeTab === 'config' && (
        <section className="sidebar-section">
          <h2 className="sidebar-title">Configuración Editorial</h2>
          <Accordion items={accordionItems} defaultOpen="formato" />
        </section>
      )}
    </aside>
  );
}

export default memo(SidebarLeft);
