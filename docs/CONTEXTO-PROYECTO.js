/**
 * EDITORIAL APP - CONTEXTO COMPLETO DEL PROYECTO
 * ===============================================
 * 
 * Este archivo contiene el contexto histórico completo de Development
 * para que Claude en VS Code (o cualquier IA) entienda el estado actual
 * del proyecto y qué falta por hacer.
 * 
 * Fecha: Febrero 2026
 * Estado: En desarrollo activo
 */

// ================================================================
// RESUMEN DEL PROYECTO
// ================================================================

/*
NOMBRE: Editorial App
DESCRIPCIÓN: Editor web profesional de libros para publicación en Amazon KDP
OBJETIVO: Permitir a autores escribir, formatear y exportar libros listos para KDP

*/

// ================================================================
// ESTADO ACTUAL DE LA APP (Febrero 2026)
// ================================================================

const PROJECT_STATE = {
  
  COMPLETADO: {
    "1. Estructura HTML": {
      status: "✅ COMPLETO",
      archivos: ["index.html"],
      features: [
        "Header con navegación",
        "Layout de 3 columnas (sidebar izq, editor central, sidebar der)",
        "Sidebar izquierdo: Estructura y Configuración",
        "Sidebar derecho: Vista previa y Exportación",
        "Footer con información",
        "Área de upload de archivos (arrastra o selecciona)",
        "Editor de texto contenteditable",
        "Toolbar con herramientas de formato"
      ]
    },

    "2. CSS Responsive": {
      status: "✅ COMPLETO",
      archivos: [
        "css/reset.css",
        "css/base.css",
        "css/typography.css",
        "css/layout.css",        // Layout de 3 columnas con grid
        "css/components.css",     // Botones, inputs, notifications
        "css/editor.css",         // Upload area y editor
        "css/preview.css",        // Contenedor preview
        "css/sidebar.css",        // Sidebars y tabs
        "css/toolbar.css",        // Toolbar editor
        "css/responsive.css"      // Mobile responsive
      ],
      features: [
        "Grid de 3 columnas sin duplicaciones",
        "Márgenes y espaciado correcto",
        "Responsive para tabletas y móviles",
        "Scrollbars personalizados",
        "Animaciones suaves"
      ]
    },

    "3. Estándares Amazon KDP": {
      status: "✅ COMPLETO",
      archivos: ["lib/amazon-kdp-standards.js"],
      features: [
        "6 formatos de página (5x8, 6x9, A4, A5, 8x10, Letter)",
        "Márgenes mínimos y recomendados por KDP",
        "Sangría estándar (0.5 pulgadas)",
        "Gutter (espacio del lomo)",
        "5 tipos de libro predefinidos:",
        "  - Novela/Ficción",
        "  - Ensayo/No ficción",
        "  - Poesía",
        "  - Manual/Técnico",
        "  - Libro infantil",
        "Tipografía: fuentes, tamaños, interlineado",
        "Métodos para validar márgenes",
        "Métodos para obtener recomendaciones por tipo"
      ]
    },

    "4. JavaScript Principal": {
      status: "✅ COMPLETO",
      archivos: ["js/main.js"],
      features: [
        "Clase EditorialApp con estado global",
        "Sistema de eventos robusto",
        "Gestión de capítulos",
        "Edición de texto con undo/redo",
        "Detección automática de capítulos en texto importado",
        "Cálculo de estadísticas (palabras, caracteres, páginas, tiempo lectura)",
        "Sistema de tabs funcional (Estructura/Configuración)",
        "Guardado de proyectos como JSON",
        "Integración con estándares KDP",
        "Métodos auxiliares (countWords, escapeHtml, etc)"
      ]
    },

    "5. Preview Renderer": {
      status: "🟡 PARCIAL",
      archivos: ["js/preview-renderer.js"],
      features: [
        "Clase PreviewRenderer para visualización",
        "Renderizado con márgenes reales KDP",
        "Indicadores visuales de márgenes",
        "Zoom ajustable",
        "Información del libro (formato, tipografía, márgenes)",
        "Paginación básica (EN DESARROLLO)"
      ],
      problemas: [
        "Paginación no agrupa contenido correctamente",
        "No divide bien en páginas cuando hay mucho texto",
        "Necesita mejor algoritmo de cálculo de altura"
      ]
    },

    "6. Funcionalidad Upload": {
      status: "✅ COMPLETO",
      features: [
        "Selección de archivo (click)",
        "Drag & drop de archivos",
        "Pegar texto directamente",
        "Detección automática de capítulos",
        "Extracción de títulos",
        "Conversión básica a HTML",
        "Soporte formatos: TXT, MD, DOCX, HTML, ODT"
      ]
    },

    "7. Sistema de Tabs": {
      status: "✅ COMPLETO",
      features: [
        "Tabs en sidebar izquierdo (Estructura/Configuración)",
        "Tabs en sidebar derecho (Preview/Exportar)",
        "Switch suave entre tabs",
        "Activación visual con underline azul",
        "aria-selected para accesibilidad"
      ]
    },

    "8. Configuración KDP": {
      status: "✅ COMPLETADO",
      features: [
        "Integración de estándares KDP en UI",
        "Campos para: formato, fuente, tamaño, interlineado",
        "Aplicación automática de config por tipo de libro",
        "Validación de márgenes contra estándares",
        "Recomendaciones inteligentes"
      ]
    }
  },

  EN_DESARROLLO: {
    "Preview Mejorado": {
      status: "🔄 EN PROGRESO",
      objetivo: "Mostrar libro paginado correctamente como se vería en KDP",
      necesario: [
        "Mejorar algoritmo de paginación",
        "Calcular altura real de contenido",
        "Dividir párrafos entre páginas si es necesario",
        "Mostrar números de página correctos",
        "Navegación entre páginas (prev/next)"
      ],
      notas: "Se creó preview-renderer.js pero necesita refinamiento en cálculos"
    },

    "Exportación": {
      status: "⏳ NO INICIADO",
      funcionalidades: [
        "Exportar a PDF (con márgenes KDP)",
        "Exportar a EPUB (para e-readers)",
        "Exportar a HTML (para web)"
      ],
      notas: "Se preparó estructura base en main.js, pero métodos exportPdf(), exportEpub(), exportHtml() solo muestran notificaciones"
    }
  },

  PENDIENTE: {
    "Módulo de Configuración Avanzada": {
      tareas: [
        "Permitir márgenes personalizados",
        "Validar en tiempo real contra KDP",
        "Guardar presets personalizados",
        "Importar/exportar configuración"
      ]
    },

    "Módulo de Corrección": {
      tareas: [
        "Revisor ortográfico",
        "Detector de plagio",
        "Estadísticas de legibilidad",
        "Sugerencias de mejora"
      ]
    },

    "Módulo de Diseño": {
      tareas: [
        "Editor de portada",
        "Galería de templates",
        "Herramienta de colores"
      ]
    },

    "Cloud Sync": {
      tareas: [
        "Guardado en la nube",
        "Sincronización entre dispositivos",
        "Versionado de documentos"
      ]
    }
  }
};

// ================================================================
// ESTRUCTURA DE CARPETAS
// ================================================================

const FILE_STRUCTURE = `
editorial-app/
├── index.html                     # Página principal (HTML estructura)
├── model.html                     # Estructura editorial (referencia)
├── sample.html                    # Muestra visual de paginación (referencia)
│
├── css/                          # Estilos (10 archivos)
│   ├── reset.css                 # Reset HTML5
│   ├── base.css                  # Variables CSS y contenedor
│   ├── typography.css            # Estilos de texto
│   ├── layout.css                # Layout de 3 columnas (IMPORTANTE)
│   ├── components.css            # Botones, inputs, modales
│   ├── editor.css                # Editor y upload area
│   ├── preview.css               # Preview container
│   ├── sidebar.css               # Sidebars y tabs
│   ├── toolbar.css               # Toolbar del editor
│   └── responsive.css            # Media queries mobile
│
├── js/                           # JavaScript
│   ├── main.js                   # Clase EditorialApp (PRINCIPAL)
│   └── preview-renderer.js       # Renderizador de preview (EN DESARROLLO)
│
├── lib/                          # Librerías externas
│   └── amazon-kdp-standards.js   # Estándares KDP (IMPORTANTE)
│
└── data/                         # Proyectos guardados (opcional)
    └── mi-libro.json
`;

// ================================================================
// FLUJO DE LA APLICACIÓN
// ================================================================

const APP_FLOW = `
1. INICIO
   └─ Usuario abre index.html
   └─ Carga EditorialApp class
   └─ Inicializa estado y listeners
   └─ Carga estándares KDP

2. IMPORTAR CONTENIDO
   └─ Usuario carga archivo O pega texto
   └─ Se detectan capítulos automáticamente
   └─ Se crea array de capítulos
   └─ Se muestra editor

3. EDITAR
   └─ Usuario edita en contenteditable
   └─ Se actualiza estado en tiempo real
   └─ Se muestran estadísticas (palabras, caracteres, etc)

4. CONFIGURAR
   └─ Usuario selecciona tipo de libro (novela, ensayo, etc)
   └─ Se aplican márgenes y tipografía de KDP automáticamente
   └─ Vista previa se actualiza

5. PREVISUALIZAS
   └─ Usuario hace click "Mostrar preview"
   └─ Se renderiza página formateada con márgenes KDP
   └─ Se muestra con indicadores de márgenes

6. EXPORTAR
   └─ Usuario selecciona formato (PDF, EPUB, HTML)
   └─ Se genera archivo descargable
   └─ Se guarda en máquina del usuario
`;

// ================================================================
// QUÉ SIGUE A CONTINUACIÓN
// ================================================================

const NEXT_STEPS = {
  
  INMEDIATO: {
    1: "Mejorar PreviewRenderer para paginación real",
    2: "Mostrar múltiples páginas navegables",
    3: "Calcular correctamente altura de contenido"
  },

  CORTO_PLAZO: {
    1: "Implementar exportación a PDF",
    2: "Implementar exportación a EPUB",
    3: "Implementar exportación a HTML",
    4: "Instalar Git Bash en Windows para usar Claude Code"
  },

  MEDIANO_PLAZO: {
    1: "Agregar más opciones de configuración",
    2: "Implementar corrección ortográfica",
    3: "Agregar templates de portadas",
    4: "Guardado en localStorage o base de datos"
  }
};

// ================================================================
// COMANDOS ÚTILES PARA VSCODE
// ================================================================

const VSCODE_TIPS = `
Cuando uses Claude en VS Code, puedes decir:

- "¿Cómo está estructurado este código?"
- "¿Qué hace esta función?"
- "Ayúdame a arreglar este bug"
- "Optimiza este código"
- "Explícame qué es un PreviewRenderer"
- "¿Cuáles son los siguientes pasos del proyecto?"

Claude en VS Code tendrá el contexto del archivo actual.
`;

// ================================================================
// INFORMACIÓN IMPORTANTE
// ================================================================

const IMPORTANT_INFO = {
  
  BASES_DE_DATOS: "No hay BD, todo está en memoria + JSON",
  
  AUTENTICACION: "No hay autenticación, es local",
  
  ESTÁNDARES_KDP: "Todos basados en https://kdp.amazon.com/",
  
  NAVEGADOR: "Probado en Chrome, Firefox, Safari, Edge",
  
  VERSIÓN: "1.0.0 - Development",
  
  AUTOR: "Giovanny Canela - Pastor y escritor cristiano",
  
  PROPÓSITO_REAL: "Ayudar a autores cristianos a publicar en KDP con estándares profesionales"
};

// ================================================================
// PROBLEMAS CONOCIDOS
// ================================================================

const KNOWN_ISSUES = [
  {
    id: 1,
    titulo: "Preview no pagina bien",
    descripcion: "El contenido no se divide correctamente en páginas",
    severidad: "Alta",
    archivo: "js/preview-renderer.js",
    linea: "generatePages() - ~100"
  },
  {
    id: 2,
    titulo: "Exportación no funciona",
    descripcion: "Botones de export solo muestran notificaciones",
    severidad: "Alta",
    archivo: "js/main.js",
    linea: "exportPdf(), exportEpub(), exportHtml() - ~900"
  },
  {
    id: 3,
    titulo: "Git Bash requerido en Windows",
    descripcion: "Claude Code necesita git-bash instalado",
    severidad: "Media",
    solucion: "Instalar desde https://git-scm.com/download/win"
  }
];

// ================================================================
// CÓMO USAR ESTE ARCHIVO
// ================================================================

const HOW_TO_USE = `
1. Abre este archivo en VS Code
2. Presiona Ctrl+Shift+P y abre Claude Assistant
3. Pregunta sobre lo que necesites:
   
   Ejemplos:
   - "¿En qué línea está el método renderPreview?"
   - "¿Qué necesito hacer para mejorar la paginación?"
   - "¿Cuál es el siguiente paso del proyecto?"
   - "Ayúdame a entender cómo funciona PreviewRenderer"
   
4. Claude tendrá todo el contexto y podrá ayudarte mejor

NOTA: Este archivo es solo referencia. El código real está en 
los archivos .js, .html y .css
`;

// ================================================================
// CONTACTO Y REFERENCIAS
// ================================================================

console.log(`
╔════════════════════════════════════════════════════════════════╗
║          EDITORIAL APP - CONTEXTO COMPLETO                     ║
║                                                                ║
║  Estado: En desarrollo activo                                  ║
║  Fecha: Febrero 2026                                           ║
║  Versión: 1.0.0                                                ║
║                                                                ║
║  ✅ Estructura HTML y CSS completa                             ║
║  ✅ Estándares Amazon KDP integrados                           ║
║  ✅ Editor de texto funcional                                  ║
║  🟡 Preview renderer (mejorando paginación)                    ║
║  ⏳ Exportación (PDF, EPUB, HTML)                              ║
║                                                                ║
║  Lee este archivo para entender el proyecto completo.          ║
║  Usa Claude en VS Code para obtener ayuda específica.          ║
╚════════════════════════════════════════════════════════════════╝
`);
