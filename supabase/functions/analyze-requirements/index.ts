import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Llamar a OpenRouter API con un modelo gratuito
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://requirement-composer.lovable.app',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [
          {
            role: 'system',
            content: `Eres un analista de software experto. Tu tarea es analizar especificaciones de software y proponer una estructura de procesos, subprocesos y casos de uso.

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

Genera entre 2-4 procesos principales, cada uno con 2-3 subprocesos, y cada subproceso con 2-4 casos de uso relevantes.`
          },
          {
            role: 'user',
            content: `Analiza la siguiente especificación de software y genera la estructura de procesos:\n\n${specification}`
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error de OpenRouter:', response.status, errorText);
      throw new Error(`Error al llamar a OpenRouter: ${response.status}`);
    }

    const data = await response.json();
    console.log('Respuesta de OpenRouter recibida');
    
    const generatedContent = data.choices[0].message.content;
    console.log('Contenido generado:', generatedContent);

    // Parsear la respuesta JSON
    let parsedData;
    try {
      // Limpiar el contenido si viene con markdown o texto adicional
      let cleanContent = generatedContent.trim();
      
      // Remover bloques de código markdown si existen
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      parsedData = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Error al parsear JSON:', parseError);
      console.error('Contenido que falló:', generatedContent);
      throw new Error('La IA no generó un JSON válido');
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
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Error desconocido',
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});