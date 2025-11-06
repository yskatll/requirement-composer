import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Lista de modelos gratuitos de OpenRouter en orden de preferencia
const CANDIDATE_MODELS = [
  'qwen/qwen3-235b-a22b:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
];

const SYSTEM_PROMPT = `Eres un analista de software experto. Tu tarea es analizar especificaciones de software y proponer una estructura de procesos, subprocesos y casos de uso.

IMPORTANTE: Debes responder ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes o después. El formato debe ser:

{
  "procesos": [
    {
      "nombre": "Nombre del proceso",
      "descripcion": "Descripción detallada",
      "subprocesos": [
        {
          "nombre": "Nombre del subproceso",
          "descripcion": "Descripción del subproceso",
          "casos_uso": [
            {
              "nombre": "Nombre del caso de uso",
              "descripcion": "Descripción completa",
              "actor_principal": "Usuario/Sistema",
              "tipo_caso_uso": 1,
              "precondiciones": "Qué debe existir antes",
              "postcondiciones": "Qué existe después",
              "criterios_de_aceptacion": "Cómo validar el éxito"
            }
          ]
        }
      ]
    }
  ]
}

Notas sobre tipo_caso_uso:
- 1 = Funcional (interacción directa del usuario)
- 2 = No Funcional (rendimiento, seguridad, etc.)
- 3 = Sistema (procesos automáticos)

Genera entre 2-4 procesos principales, cada uno con 2-3 subprocesos, y cada subproceso con 2-4 casos de uso relevantes.`;

// Helper: llamar a OpenRouter con un modelo específico
async function callOpenRouter(model: string, messages: any[], apiKey: string) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://rcwutmqifgiungdoekwd.supabase.co',
      'X-Title': 'Requirement Analyzer'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.5,
      max_tokens: 6000, // Aumentado para permitir respuestas completas
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      throw { code: 429, message: 'rate_limited', details: errorText };
    }
    if (response.status === 402) {
      throw { code: 402, message: 'insufficient_credits', details: errorText };
    }
    throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
  }

  return await response.json();
}

// Helper: analizar con retries y fallback de modelos
async function analyzeWithFallback(messages: any[], apiKey: string) {
  const retryDelays = [800, 2000, 4000]; // ms
  
  for (const model of CANDIDATE_MODELS) {
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        console.log(`Intentando modelo: ${model}, intento: ${attempt + 1}`);
        const data = await callOpenRouter(model, messages, apiKey);
        console.log(`✓ Respuesta exitosa con modelo: ${model} (intento ${attempt + 1})`);
        return { data, model };
      } catch (err: any) {
        if (err.code === 402) {
          // Sin créditos, no reintentar ni probar otros modelos
          console.error('Error 402: Créditos insuficientes en OpenRouter');
          return new Response(
            JSON.stringify({ success: false, error: 'Créditos insuficientes en OpenRouter.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        if (err.code === 429) {
          // Rate limit, reintentar si hay intentos disponibles
          if (attempt < retryDelays.length) {
            const delay = retryDelays[attempt];
            console.warn(`⚠ Rate limit en ${model}. Reintentando en ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            console.warn(`⚠ Rate limit persistente en ${model}. Probando siguiente modelo...`);
            break; // Pasar al siguiente modelo
          }
        }
        
        // Otro error
        console.error(`Error con modelo ${model}:`, err);
        break; // Pasar al siguiente modelo
      }
    }
  }
  
  // Si todos los modelos fallaron por 429
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: 'OpenRouter está temporalmente saturado. Por favor, intenta de nuevo en 30-60 segundos.',
      retry_after_ms: 30000
    }),
    { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Helper: limpiar y parsear JSON
function parseAIResponse(content: string) {
  let cleanContent = content.trim();
  
  console.log(`Parsing AI response (${cleanContent.length} chars)`);
  
  // Verificar que no esté truncado (debe terminar con })
  if (!cleanContent.endsWith('}') && !cleanContent.endsWith('}\n')) {
    console.error('⚠️ Respuesta truncada detectada. Últimos 100 chars:', cleanContent.slice(-100));
    throw new Error('La respuesta de la IA está incompleta. Por favor, intenta con una especificación más breve o simplificada.');
  }
  
  // Remover bloques de código markdown
  if (cleanContent.includes('```')) {
    cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  }
  
  // Extraer desde primer { hasta último }
  const firstBrace = cleanContent.indexOf('{');
  const lastBrace = cleanContent.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    cleanContent = cleanContent.substring(firstBrace, lastBrace + 1);
  }
  
  // Quitar comas colgantes
  cleanContent = cleanContent.replace(/,\s*([}\]])/g, '$1');
  
  console.log(`Cleaned content length: ${cleanContent.length} chars`);
  
  const parsed = JSON.parse(cleanContent);
  
  // Validar estructura
  if (!parsed.procesos || !Array.isArray(parsed.procesos)) {
    throw new Error('El modelo no devolvió la estructura esperada (falta array de procesos)');
  }
  
  console.log(`✓ Parsed successfully: ${parsed.procesos.length} procesos`);
  
  return parsed;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { specification } = await req.json();
    console.log('Analizando especificación:', specification);

    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY no está configurada');
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Analiza la siguiente especificación de software y genera la estructura de procesos:\n\n${specification}` }
    ];

    // Intentar con retries y fallback
    const result = await analyzeWithFallback(messages, openRouterApiKey);
    
    // Si es una Response (error), devolverla directamente
    if (result instanceof Response) {
      return result;
    }
    
    const { data, model } = result;
    const generatedContent = data.choices[0].message.content;
    console.log(`Contenido generado por ${model} (${generatedContent.length} chars)`);

    // Parsear respuesta con limpieza robusta
    let parsedData;
    try {
      parsedData = parseAIResponse(generatedContent);
    } catch (parseError) {
      console.error('Error al parsear JSON:', parseError);
      console.error('Contenido que falló:', generatedContent.substring(0, 500));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'La IA no generó un JSON válido con la estructura esperada.',
          details: parseError instanceof Error ? parseError.message : 'Error de parsing'
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Inicializar cliente de Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Insertando datos en la base de datos...');

    // Insertar en la base de datos
    const insertedData = [];
    
    for (const proceso of parsedData.procesos) {
      // Insertar proceso
      const { data: procesoData, error: procesoError } = await supabase
        .from('proceso')
        .insert({
          nombre: proceso.nombre,
          descripcion: proceso.descripcion
        })
        .select()
        .single();

      if (procesoError) {
        console.error('Error al insertar proceso:', procesoError);
        throw procesoError;
      }

      console.log('Proceso insertado:', procesoData.id_proceso);

      const procesoResult = {
        ...procesoData,
        subprocesos: []
      };

      // Insertar subprocesos
      for (const subproceso of proceso.subprocesos) {
        const { data: subprocesoData, error: subprocesoError } = await supabase
          .from('subproceso')
          .insert({
            id_proceso: procesoData.id_proceso,
            nombre: subproceso.nombre,
            descripcion: subproceso.descripcion
          })
          .select()
          .single();

        if (subprocesoError) {
          console.error('Error al insertar subproceso:', subprocesoError);
          throw subprocesoError;
        }

        console.log('Subproceso insertado:', subprocesoData.id_subproceso);

        const subprocesoResult = {
          ...subprocesoData,
          casos_uso: []
        };

        // Insertar casos de uso
        for (const casoUso of subproceso.casos_uso) {
          const { data: casoUsoData, error: casoUsoError } = await supabase
            .from('caso_uso')
            .insert({
              id_subproceso: subprocesoData.id_subproceso,
              nombre: casoUso.nombre,
              descripcion: casoUso.descripcion,
              actor_principal: casoUso.actor_principal,
              tipo_caso_uso: casoUso.tipo_caso_uso,
              precondiciones: casoUso.precondiciones,
              postcondiciones: casoUso.postcondiciones,
              criterios_de_aceptacion: casoUso.criterios_de_aceptacion
            })
            .select()
            .single();

          if (casoUsoError) {
            console.error('Error al insertar caso de uso:', casoUsoError);
            throw casoUsoError;
          }

          console.log('Caso de uso insertado:', casoUsoData.id_caso_uso);
          subprocesoResult.casos_uso.push(casoUsoData);
        }

        procesoResult.subprocesos.push(subprocesoResult);
      }

      insertedData.push(procesoResult);
    }

    console.log('Datos insertados correctamente');

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: insertedData 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error en analyze-requirements:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});