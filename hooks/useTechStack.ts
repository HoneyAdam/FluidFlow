import { useState, useEffect } from 'react';
import { TechStackConfig, DEFAULT_TECH_STACK, TECH_STACK_OPTIONS } from '../types';
import { getFluidFlowConfig } from '../services/fluidflowConfig';
import { STORAGE_KEYS } from '../constants/storage';

// Helper to get option info from TECH_STACK_OPTIONS
const getOptionInfo = (category: keyof TechStackConfig, value: string) => {
  const options = TECH_STACK_OPTIONS[category];
  return options?.find(opt => opt.value === value);
};

export const useTechStack = () => {
  const [techStack, setTechStack] = useState<TechStackConfig>(DEFAULT_TECH_STACK);

  // Load tech stack from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TECH_STACK);
      if (saved) {
        const parsedTechStack = JSON.parse(saved);
        // Merge with default to ensure all fields exist
        setTechStack({
          ...DEFAULT_TECH_STACK,
          ...parsedTechStack,
          // Deep merge for nested objects
          styling: { ...DEFAULT_TECH_STACK.styling, ...parsedTechStack.styling },
          icons: { ...DEFAULT_TECH_STACK.icons, ...parsedTechStack.icons },
          uiComponents: { ...DEFAULT_TECH_STACK.uiComponents, ...parsedTechStack.uiComponents },
          stateManagement: { ...DEFAULT_TECH_STACK.stateManagement, ...parsedTechStack.stateManagement },
          routing: { ...DEFAULT_TECH_STACK.routing, ...parsedTechStack.routing },
          dataFetching: { ...DEFAULT_TECH_STACK.dataFetching, ...parsedTechStack.dataFetching },
          forms: { ...DEFAULT_TECH_STACK.forms, ...parsedTechStack.forms },
          animations: { ...DEFAULT_TECH_STACK.animations, ...parsedTechStack.animations },
          charts: { ...DEFAULT_TECH_STACK.charts, ...parsedTechStack.charts },
          dateTime: { ...DEFAULT_TECH_STACK.dateTime, ...parsedTechStack.dateTime },
          media: { ...DEFAULT_TECH_STACK.media, ...parsedTechStack.media },
          testing: { ...DEFAULT_TECH_STACK.testing, ...parsedTechStack.testing }
        });
      }
    } catch (error) {
      console.error('Error loading tech stack:', error);
    }
  }, []);

  // Save to localStorage whenever tech stack changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TECH_STACK, JSON.stringify(techStack));
    } catch (error) {
      console.error('Error saving tech stack:', error);
    }
  }, [techStack]);

  const updateTechStack = (category: keyof TechStackConfig, library: string, version?: string) => {
    setTechStack(prev => ({
      ...prev,
      [category]: {
        // Dynamic category key requires type assertion; each category has different library union types
        library: library as TechStackConfig[typeof category]['library'],
        version: version || prev[category].version
      }
    }));
  };

  const resetTechStack = () => {
    setTechStack(DEFAULT_TECH_STACK);
  };

  // Generate system instruction based on current tech stack and project rules
  const generateSystemInstruction = () => {
    let instruction = '';

    // Add project rules from FluidFlow config
    const config = getFluidFlowConfig();
    const rules = config.getRules();
    if (rules && rules.trim()) {
      instruction += `\n\n**PROJECT RULES (Follow these guidelines)**:\n${rules}`;
    }

    // Technology stack section header
    instruction += '\n\n**TECHNOLOGY STACK (Use these specific libraries and versions)**:';

    // Styling
    const stylingInfo = getOptionInfo('styling', techStack.styling.library);
    if (stylingInfo && stylingInfo.value !== 'css-modules') {
      instruction += `\n- **Styling**: ${stylingInfo.label} (${stylingInfo.version}) - ${stylingInfo.description}`;
      // Add specific usage hints
      if (stylingInfo.value === 'tailwind') {
        instruction += '. Use utility classes directly on elements.';
      } else if (stylingInfo.value === 'material-ui') {
        instruction += '. Import from @mui/material.';
      } else if (stylingInfo.value === 'chakra-ui') {
        instruction += '. Use style props on Chakra components.';
      }
    } else {
      instruction += '\n- **Styling**: CSS Modules with .module.css files';
    }

    // Icons
    const iconsInfo = getOptionInfo('icons', techStack.icons.library);
    if (iconsInfo) {
      instruction += `\n- **Icons**: ${iconsInfo.label} (${iconsInfo.version})`;
      if (iconsInfo.value === 'lucide-react') {
        instruction += '. Usage: `import { IconName } from "lucide-react"` then `<IconName className="w-4 h-4" />`';
      } else if (iconsInfo.value === 'react-icons') {
        instruction += '. Usage: `import { FaIcon } from "react-icons/fa"`';
      } else if (iconsInfo.value === 'heroicons') {
        instruction += '. Usage: `import { IconName } from "@heroicons/react/24/outline"`';
      }
    }

    // UI Components
    const uiInfo = getOptionInfo('uiComponents', techStack.uiComponents.library);
    if (uiInfo && uiInfo.value !== 'none') {
      instruction += `\n- **UI Components**: ${uiInfo.label} (${uiInfo.version})`;
      if (uiInfo.value === 'shadcn-ui') {
        instruction += '. Import from `@/components/ui/*`. Use existing components or generate new ones following shadcn patterns.';
      } else if (uiInfo.value === 'radix-ui') {
        instruction += '. Import primitives from `@radix-ui/react-*`. Build accessible components with unstyled primitives.';
      } else if (uiInfo.value === 'headless-ui') {
        instruction += '. Import from `@headlessui/react`. Use with Tailwind for styling.';
      } else if (uiInfo.value === 'daisyui') {
        instruction += '. Use daisyUI class names on Tailwind elements (e.g., `btn`, `card`, `modal`).';
      } else if (uiInfo.value === 'flowbite') {
        instruction += '. Import from `flowbite-react`. Tailwind-styled components ready to use.';
      }
    }

    // State Management
    const stateInfo = getOptionInfo('stateManagement', techStack.stateManagement.library);
    if (stateInfo && stateInfo.value !== 'none' && stateInfo.value !== 'context-api') {
      instruction += `\n- **State Management**: ${stateInfo.label} (${stateInfo.version}) - ${stateInfo.description}`;
      if (stateInfo.value === 'zustand') {
        instruction += '. Create stores with `create()` from zustand.';
      } else if (stateInfo.value === 'redux-toolkit') {
        instruction += '. Use `configureStore` and `createSlice`.';
      }
    } else if (stateInfo?.value === 'context-api') {
      instruction += '\n- **State Management**: React Context API with useContext and useReducer hooks';
    } else {
      instruction += '\n- **State Management**: React built-in useState/useReducer hooks';
    }

    // Routing
    const routingInfo = getOptionInfo('routing', techStack.routing.library);
    if (routingInfo && routingInfo.value !== 'none') {
      instruction += `\n- **Routing**: ${routingInfo.label} (${routingInfo.version})`;
      if (routingInfo.value === 'react-router') {
        instruction += '. Use BrowserRouter, Routes, Route, useNavigate, Link from "react-router".';
      } else if (routingInfo.value === 'reach-router') {
        instruction += '. Type-safe routing with full TypeScript support.';
      }
    } else {
      instruction += '\n- **Routing**: Single-page application (no routing library needed)';
    }

    // Data Fetching
    const dataInfo = getOptionInfo('dataFetching', techStack.dataFetching.library);
    if (dataInfo && dataInfo.value !== 'none' && dataInfo.value !== 'fetch') {
      instruction += `\n- **Data Fetching**: ${dataInfo.label} (${dataInfo.version})`;
      if (dataInfo.value === 'react-query') {
        instruction += '. Use useQuery, useMutation from "@tanstack/react-query".';
      } else if (dataInfo.value === 'swr') {
        instruction += '. Use useSWR hook from "swr".';
      } else if (dataInfo.value === 'axios') {
        instruction += '. Use axios for HTTP requests with proper error handling.';
      }
    } else {
      instruction += '\n- **Data Fetching**: Built-in fetch API';
    }

    // Forms
    const formsInfo = getOptionInfo('forms', techStack.forms.library);
    if (formsInfo && formsInfo.value !== 'none') {
      instruction += `\n- **Forms**: ${formsInfo.label} (${formsInfo.version})`;
      if (formsInfo.value === 'react-hook-form') {
        instruction += '. Use useForm, Controller, handleSubmit.';
      } else if (formsInfo.value === 'formik') {
        instruction += '. Use Formik with Yup for validation.';
      }
    } else {
      instruction += '\n- **Forms**: Standard HTML forms with React state';
    }

    // Animations
    const animInfo = getOptionInfo('animations', techStack.animations.library);
    if (animInfo && animInfo.value !== 'none') {
      instruction += `\n- **Animations**: ${animInfo.label} (${animInfo.version})`;
      if (animInfo.value === 'framer-motion') {
        instruction += '. Use motion components (motion.div) and useAnimation from "motion/react".';
      } else if (animInfo.value === 'react-spring') {
        instruction += '. Use useSpring, animated from "@react-spring/web".';
      }
    } else {
      instruction += '\n- **Animations**: CSS transitions and keyframe animations';
    }

    // Charts & Data Visualization
    const chartsInfo = getOptionInfo('charts', techStack.charts.library);
    if (chartsInfo && chartsInfo.value !== 'none') {
      instruction += `\n- **Charts**: ${chartsInfo.label} (${chartsInfo.version})`;
      if (chartsInfo.value === 'recharts') {
        instruction += '. Use composable components: `<LineChart>`, `<BarChart>`, `<PieChart>` with `<XAxis>`, `<YAxis>`, `<Tooltip>`.';
      } else if (chartsInfo.value === 'visx') {
        instruction += '. Low-level primitives from `@visx/*`. Full control over SVG rendering.';
      } else if (chartsInfo.value === 'nivo') {
        instruction += '. Import from `@nivo/line`, `@nivo/bar`, etc. Rich interactive charts.';
      } else if (chartsInfo.value === 'chartjs') {
        instruction += '. Import from `react-chartjs-2`. Register required components from `chart.js`.';
      } else if (chartsInfo.value === 'tremor') {
        instruction += '. Import from `@tremor/react`. Dashboard-ready components like `<AreaChart>`, `<Card>`.';
      }
    }

    // Date & Time
    const dateInfo = getOptionInfo('dateTime', techStack.dateTime.library);
    if (dateInfo && dateInfo.value !== 'none') {
      instruction += `\n- **Date/Time**: ${dateInfo.label} (${dateInfo.version})`;
      if (dateInfo.value === 'date-fns') {
        instruction += '. Import functions: `import { format, parseISO, differenceInDays } from "date-fns"`.';
      } else if (dateInfo.value === 'dayjs') {
        instruction += '. Import: `import dayjs from "dayjs"`. Chain methods: `dayjs().format("YYYY-MM-DD")`.';
      } else if (dateInfo.value === 'luxon') {
        instruction += '. Import: `import { DateTime } from "luxon"`. Use `DateTime.now()`, `.toFormat()`.';
      } else if (dateInfo.value === 'moment') {
        instruction += '. ⚠️ Legacy library. Consider migrating to date-fns or dayjs for new projects.';
      }
    }

    // Media Handling
    const mediaInfo = getOptionInfo('media', techStack.media.library);
    if (mediaInfo && mediaInfo.value !== 'none') {
      instruction += `\n- **Media**: ${mediaInfo.label} (${mediaInfo.version})`;
      if (mediaInfo.value === 'react-dropzone') {
        instruction += '. Use `useDropzone` hook for drag-and-drop file uploads with validation.';
      } else if (mediaInfo.value === 'react-player') {
        instruction += '. Use `<ReactPlayer url="..." />` for YouTube, Vimeo, SoundCloud, local files.';
      } else if (mediaInfo.value === 'browser-image-compression') {
        instruction += '. Use `imageCompression(file, options)` to compress images client-side before upload.';
      }
    }

    // Note: Component Architecture, FluidFlow Element IDs, and Import Path rules
    // are already included in the base generation prompt (generation-marker.md)
    // to avoid duplication and reduce token usage.

    // Error Fixing Guidelines
    instruction += '\n\n**ERROR FIXING GUIDELINES (When fixing runtime errors)**:';
    instruction += '\n- Carefully analyze the error message and stack trace to identify the root cause';
    instruction += '\n- Check for common issues: undefined variables, missing imports, incorrect prop types, async/await errors';
    instruction += '\n- Ensure all required imports are present at the top of the file';
    instruction += '\n- Verify that component props match their expected types';
    instruction += '\n- For TypeScript errors, ensure proper type annotations and null checks';
    instruction += '\n- When fixing, provide the COMPLETE updated file - do not use partial snippets or placeholders';
    instruction += '\n- After fixing, briefly explain what caused the error and how it was resolved';

    return instruction;
  };

  return {
    techStack,
    updateTechStack,
    resetTechStack,
    generateSystemInstruction
  };
};