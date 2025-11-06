import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CasoUso {
  id_caso_uso: number;
  nombre: string;
  descripcion: string;
  actor_principal: string;
  tipo_caso_uso: number;
  precondiciones: string;
  postcondiciones: string;
  criterios_de_aceptacion: string;
}

interface Subproceso {
  id_subproceso: number;
  nombre: string;
  descripcion: string;
  casos_uso: CasoUso[];
}

interface Proceso {
  id_proceso: number;
  nombre: string;
  descripcion: string;
  subprocesos: Subproceso[];
}

const getTipoCasoUsoLabel = (tipo: number) => {
  switch (tipo) {
    case 1: return "Funcional";
    case 2: return "No Funcional";
    case 3: return "Sistema";
    default: return "Desconocido";
  }
};

const getTipoCasoUsoColor = (tipo: number) => {
  switch (tipo) {
    case 1: return "bg-primary/10 text-primary border-primary/20";
    case 2: return "bg-accent/10 text-accent border-accent/20";
    case 3: return "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20";
    default: return "bg-muted text-muted-foreground";
  }
};

export const RequirementAnalyzer = () => {
  const [specification, setSpecification] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<Proceso[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!specification.trim()) {
      toast.error("Por favor, ingresa una especificación");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResults(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'analyze-requirements',
        {
          body: { specification }
        }
      );

      if (functionError) {
        // Manejar errores de red/servidor
        const errorMsg = functionError.message || 'Error desconocido';
        
        if (errorMsg.includes('non-2xx')) {
          // Error HTTP del edge function
          throw new Error(
            'OpenRouter está temporalmente saturado o hubo un problema con el análisis. ' +
            'Por favor, espera unos segundos e intenta nuevamente.'
          );
        }
        
        throw new Error(errorMsg);
      }

      if (!data.success) {
        // Error desde el edge function con mensaje específico
        const errorDetails = data.error || 'Error al analizar la especificación';
        
        if (data.retry_after_ms) {
          throw new Error(
            `${errorDetails} (sugerencia: espera ${Math.round(data.retry_after_ms / 1000)}s)`
          );
        }
        
        throw new Error(errorDetails);
      }

      setResults(data.data);
      toast.success("Análisis completado exitosamente");
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMessage);
      toast.error(`Error en el análisis: ${errorMessage}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-background to-secondary/30 flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-6xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight">
            Analizador de Requisitos
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Describe tu proyecto de software y obtén una estructura completa de procesos, subprocesos y casos de uso generados por IA
          </p>
        </div>

        {/* Input Section */}
        <Card className="p-6 md:p-8 shadow-lg animate-in fade-in slide-in-from-bottom-5 duration-700 delay-100">
          <div className="space-y-4">
            <label htmlFor="specification" className="text-lg font-semibold text-foreground block">
              Especificación del Software
            </label>
            <Textarea
              id="specification"
              placeholder="Ej: Necesito un sistema de gestión de inventario para una tienda de electrónica que permita registrar productos, controlar stock, gestionar ventas y generar reportes..."
              value={specification}
              onChange={(e) => setSpecification(e.target.value)}
              className="min-h-[200px] text-base resize-none focus-visible:ring-2 focus-visible:ring-primary transition-all"
              disabled={isAnalyzing}
            />
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !specification.trim()}
              className="w-full md:w-auto px-8 h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Analizar Especificación
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="p-6 bg-destructive/10 border-destructive/20 animate-in fade-in slide-in-from-bottom-3 duration-500">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-destructive mb-1">Error en el análisis</h3>
                <p className="text-sm text-destructive/80">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Results Display */}
        {results && results.length > 0 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-accent" />
              <h2 className="text-2xl font-bold text-foreground">Resultados del Análisis</h2>
            </div>

            {results.map((proceso) => (
              <Card key={proceso.id_proceso} className="p-6 space-y-5 shadow-md hover:shadow-lg transition-shadow">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-primary">{proceso.nombre}</h3>
                  <p className="text-muted-foreground">{proceso.descripcion}</p>
                </div>

                {proceso.subprocesos && proceso.subprocesos.length > 0 && (
                  <div className="space-y-4 pl-4 border-l-2 border-primary/30">
                    {proceso.subprocesos.map((subproceso) => (
                      <div key={subproceso.id_subproceso} className="space-y-3">
                        <div className="space-y-1">
                          <h4 className="text-lg font-semibold text-foreground">{subproceso.nombre}</h4>
                          <p className="text-sm text-muted-foreground">{subproceso.descripcion}</p>
                        </div>

                        {subproceso.casos_uso && subproceso.casos_uso.length > 0 && (
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {subproceso.casos_uso.map((casoUso) => (
                              <Card key={casoUso.id_caso_uso} className="p-4 space-y-3 hover:shadow-md transition-shadow bg-card/50">
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <h5 className="font-semibold text-sm text-foreground leading-tight">{casoUso.nombre}</h5>
                                    <Badge variant="outline" className={getTipoCasoUsoColor(casoUso.tipo_caso_uso)}>
                                      {getTipoCasoUsoLabel(casoUso.tipo_caso_uso)}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2">{casoUso.descripcion}</p>
                                </div>

                                <div className="space-y-2 text-xs">
                                  <div>
                                    <span className="font-medium text-foreground">Actor:</span>{" "}
                                    <span className="text-muted-foreground">{casoUso.actor_principal}</span>
                                  </div>
                                  {casoUso.precondiciones && (
                                    <div>
                                      <span className="font-medium text-foreground">Precondiciones:</span>{" "}
                                      <span className="text-muted-foreground">{casoUso.precondiciones}</span>
                                    </div>
                                  )}
                                  {casoUso.criterios_de_aceptacion && (
                                    <div>
                                      <span className="font-medium text-foreground">Criterios:</span>{" "}
                                      <span className="text-muted-foreground">{casoUso.criterios_de_aceptacion}</span>
                                    </div>
                                  )}
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};