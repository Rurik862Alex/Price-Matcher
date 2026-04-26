import React, { useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileUp, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Loader2,
  FileSpreadsheet,
  History,
  Settings2,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, MatchResult } from './lib/types';
import { matchProducts, prepareMasterData } from './lib/matching';
import { cn } from './lib/utils';

export default function App() {
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [masterData, setMasterData] = useState<Product[]>([]);
  const [targetData, setTargetData] = useState<Product[]>([]);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');

  // Handle file reading
  const readExcel = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        resolve(json);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const findColumn = (item: any, possibleNames: string[]) => {
    const keys = Object.keys(item);
    const normalizedTargetNames = possibleNames.map(n => n.toLowerCase().trim());
    
    // 1. Try exact match (normalized)
    for (const key of keys) {
      const normalizedKey = key.toLowerCase().trim();
      if (normalizedTargetNames.includes(normalizedKey)) {
        return item[key];
      }
    }

    // 2. Try partial match
    for (const key of keys) {
      const normalizedKey = key.toLowerCase().trim();
      if (normalizedTargetNames.some(target => normalizedKey.includes(target) || target.includes(normalizedKey))) {
        return item[key];
      }
    }
    return undefined;
  };

  const onMasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMasterFile(file);
      setStatus('Чтение общего прайса...');
      try {
        const data = await readExcel(file);
        if (data.length === 0) {
          throw new Error('Файл пуст или имеет неверный формат');
        }

        const products: Product[] = data.map((item: any) => {
          const article = findColumn(item, ['Артикул', 'Арт.', 'Article', 'Part Number', 'PN']);
          const name = findColumn(item, ['Наименование', 'Название', 'Номенклатура', 'Name', 'Item', 'Product']);
          const manufacturer = findColumn(item, ['Производитель', 'Бренд', 'Brand', 'Manufacturer', 'Vendor']);
          const code = findColumn(item, ['Код', 'Код товара', 'Code', 'ID', 'Internal Code']);

          return {
            ...item,
            article: String(article !== undefined ? article : (item.article || '')).trim(),
            name: String(name !== undefined ? name : (item.name || '')).trim(),
            manufacturer: String(manufacturer !== undefined ? manufacturer : (item.manufacturer || 'Прочее')).trim(),
            code: String(code !== undefined ? code : (item.code || '')).trim(),
          };
        });

        const validProducts = products.filter(p => p.article || p.name);
        if (validProducts.length === 0) {
          throw new Error('Не удалось найти колонки "Артикул" или "Наименование"');
        }

        setMasterData(validProducts);
        setStatus(`Загружено ${validProducts.length} товаров из общего прайса.`);
      } catch (err) {
        console.error(err);
        setStatus(`Ошибка: ${err instanceof Error ? err.message : 'Не удалось прочитать общий прайс'}`);
      }
    }
  };

  const onTargetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTargetFile(file);
      setStatus('Чтение целевого прайса...');
      try {
        const data = await readExcel(file);
        if (data.length === 0) {
          throw new Error('Файл пуст или имеет неверный формат');
        }

        const products: Product[] = data.map((item: any) => {
          const article = findColumn(item, ['Артикул', 'Арт.', 'Article', 'Part Number', 'PN']);
          const name = findColumn(item, ['Наименование', 'Название', 'Номенклатура', 'Name', 'Item', 'Product']);
          const manufacturer = findColumn(item, ['Производитель', 'Бренд', 'Brand', 'Manufacturer', 'Vendor']);

          return {
            ...item,
            article: String(article !== undefined ? article : (item.article || '')).trim(),
            name: String(name !== undefined ? name : (item.name || '')).trim(),
            manufacturer: String(manufacturer !== undefined ? manufacturer : (item.manufacturer || 'Прочее')).trim(),
          };
        });

        const validProducts = products.filter(p => p.article || p.name);
        if (validProducts.length === 0) {
          throw new Error('Не удалось найти колонки "Артикул" или "Наименование"');
        }

        setTargetData(validProducts);
        setStatus(`Загружено ${validProducts.length} товаров из целевого прайса.`);
      } catch (err) {
        console.error(err);
        setStatus(`Ошибка: ${err instanceof Error ? err.message : 'Не удалось прочитать целевой прайс'}`);
      }
    }
  };

  const runMatching = async () => {
    if (masterData.length === 0 || targetData.length === 0) return;
    
    setIsProcessing(true);
    setStatus('Подготовка данных...');
    setResults([]);
    
    // Tiny delay to let UI show the status change
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      console.time('match_process_total');
      
      const preparedMaster = prepareMasterData(masterData);
      
      const CHUNK_SIZE = 500;
      const allResults: MatchResult[] = [];
      const total = targetData.length;
      
      // We process in chunks to prevent blocking the main thread
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = targetData.slice(i, i + CHUNK_SIZE);
        setStatus(`Сопоставление: ${(i / total * 100).toFixed(0)}% (${i} из ${total})`);
        
        // Give UI a chance to update and avoid blocking
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const chunkResults = matchProducts(chunk, preparedMaster);
        allResults.push(...chunkResults);
      }
      
      console.timeEnd('match_process_total');
      
      setResults(allResults);
      setIsProcessing(false);
      
      const matchedCount = allResults.filter(r => r && r.priority > 0).length;
      setStatus(`Сопоставление завершено. Найдено ${matchedCount} из ${total} соответствий.`);
    } catch (err) {
      console.error('Matching error:', err);
      setStatus(`Ошибка: ${err instanceof Error ? err.message : 'Неизвестная ошибка при сопоставлении'}`);
      setIsProcessing(false);
    }
  };

  const downloadResults = () => {
    if (results.length === 0) return;

    setStatus('Подготовка файла для скачивания...');
    
    const exportData = results.map(r => {
      const base = { ...r.targetItem };
      // Remove our internal keys used for normalization TO AVOID OVERWRITING 
      // if they don't match the original column names
      delete base.article;
      delete base.name;
      delete base.manufacturer;
      delete base.code;
      
      // Get found name specifically from master item
      let foundName = '';
      if (r.matchedItem) {
        // First priority: check if normalized name is set and not empty
        // Second priority: try to find the original column again with improved partial matching
        foundName = r.matchedItem.name || findColumn(r.matchedItem, ['Наименование', 'Название', 'Номенклатура', 'Name', 'Item', 'Product']) || '';
      }

      return {
        ...base,
        'Артикул_нормализованный': r.targetItem.article,
        'Наименование_нормализованное': r.targetItem.name,
        'Производитель_нормализованный': r.targetItem.manufacturer,
        'код_из_общего_прайса': r.matchedItem?.code || '',
        'точность_совпадения': r.priority === 1 ? 'Точное' : r.priority === 2 ? 'По артикулу' : r.priority === 3 ? 'Семантическое' : 'Нет совпадения',
        'найденное_наименование': String(foundName).trim()
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Результат");
    
    XLSX.writeFile(workbook, "Прайс_обновленный.xlsx");
    setStatus('Файл сохранен.');
  };

  const statistics = useMemo(() => {
    if (results.length === 0) return null;
    const total = results.length;
    const p1 = results.filter(r => r.priority === 1).length;
    const p2 = results.filter(r => r.priority === 2).length;
    const p3 = results.filter(r => r.priority === 3).length;
    const none = results.filter(r => r.priority === 0).length;

    return { total, p1, p2, p3, none, percent: Math.round(((total - none) / total) * 100) };
  }, [results]);

  return (
    <div className="min-h-screen bg-[#F5F5F3] text-[#1A1A1A] font-sans selection:bg-[#FFD700]/30">
      {/* Header */}
      <header className="border-b border-black/10 bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
              <Zap className="text-white w-5 h-5 fill-white" />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">Price Matcher Pro</h1>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium uppercase tracking-wider text-black/40">
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              v1.0.4
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Controls Column */}
          <div className="lg:col-span-4 space-y-8">
            <section className="space-y-6">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-black/30">
                <Settings2 className="w-4 h-4" />
                <span>Настройка данных</span>
              </div>

              {/* Master File Upload */}
              <div className="group relative">
                <label className={cn(
                  "flex flex-col items-center justify-center w-full aspect-[4/3] border-2 border-dashed rounded-2xl transition-all cursor-pointer",
                  masterFile ? "border-black bg-black text-white" : "border-black/10 hover:border-black/30 bg-white shadow-sm"
                )}>
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 px-8 text-center">
                    <FileSpreadsheet className={cn("w-10 h-10 mb-4 transition-transform group-hover:scale-110", masterFile ? "text-white" : "text-black/40")} />
                    <p className="mb-2 text-sm font-bold tracking-tight">Общий прайс</p>
                    <p className="text-[10px] uppercase tracking-widest opacity-60">
                      {masterFile ? masterFile.name : "Выберите файл .xlsx или .xls"}
                    </p>
                  </div>
                  <input type="file" className="hidden" accept=".xlsx, .xls" onChange={onMasterUpload} />
                </label>
              </div>

              <div className="flex justify-center -my-3 relative z-10">
                <div className="bg-[#F5F5F3] p-2 rounded-full">
                  <ArrowRight className="text-black/20" />
                </div>
              </div>

              {/* Target File Upload */}
              <div className="group relative">
                <label className={cn(
                  "flex flex-col items-center justify-center w-full aspect-[4/3] border-2 border-dashed rounded-2xl transition-all cursor-pointer",
                  targetFile ? "border-black bg-black text-white" : "border-black/10 hover:border-black/30 bg-white shadow-sm"
                )}>
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 px-8 text-center">
                    <FileUp className={cn("w-10 h-10 mb-4 transition-transform group-hover:scale-110", targetFile ? "text-white" : "text-black/40")} />
                    <p className="mb-2 text-sm font-bold tracking-tight">Целевой прайс</p>
                    <p className="text-[10px] uppercase tracking-widest opacity-60">
                      {targetFile ? targetFile.name : "Выберите файл для обновления"}
                    </p>
                  </div>
                  <input type="file" className="hidden" accept=".xlsx, .xls" onChange={onTargetUpload} />
                </label>
              </div>

              <button
                onClick={runMatching}
                disabled={!masterFile || !targetFile || isProcessing}
                className={cn(
                  "w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2",
                  (!masterFile || !targetFile)
                    ? "bg-black/5 text-black/20 cursor-not-allowed"
                    : "bg-[#FFD700] text-black hover:bg-[#FFE44D] active:scale-95 shadow-xl shadow-[#FFD700]/20"
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Обработка...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 fill-current" />
                    Запустить сопоставление
                  </>
                )}
              </button>
            </section>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-8 space-y-8">
            <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
              
              {/* Status Bar */}
              <div className="px-8 py-6 border-b border-black/5 bg-[#FBFBFA] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full", status ? "bg-[#FFD700] animate-pulse" : "bg-black/10")} />
                  <span className="text-xs font-bold uppercase tracking-widest text-black/40">
                    {status || "Ожидание загрузки файлов..."}
                  </span>
                </div>
                {results.length > 0 && (
                  <button 
                    onClick={downloadResults}
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-4 py-2 bg-black text-white rounded-lg hover:bg-black/80 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Скачать результат
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-auto p-8">
                <AnimatePresence mode="wait">
                  {results.length > 0 ? (
                    <motion.div 
                      key="results"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8"
                    >
                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: 'Всего', val: statistics?.total, icon: FileSpreadsheet },
                          { label: 'Точных', val: statistics?.p1, icon: CheckCircle2, color: 'text-green-600' },
                          { label: 'Семантика', val: (statistics?.p2 || 0) + (statistics?.p3 || 0), icon: Zap, color: 'text-amber-500' },
                          { label: 'Не найдено', val: statistics?.none, icon: AlertCircle, color: 'text-red-500' },
                        ].map((stat, i) => (
                          <div key={i} className="p-4 rounded-xl bg-[#F5F5F3] border border-black/5">
                            <div className="flex items-center gap-2 mb-2">
                              <stat.icon className={cn("w-3.5 h-3.5", stat.color || "text-black/40")} />
                              <span className="text-[9px] font-bold uppercase tracking-[0.1em] opacity-50">{stat.label}</span>
                            </div>
                            <span className="text-2xl font-mono font-medium tracking-tight">{stat.val}</span>
                          </div>
                        ))}
                      </div>

                      {/* Preview Table */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/30">Предварительный просмотр (10 записей)</h3>
                        </div>
                        <div className="border border-black/5 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-[#F5F5F3] border-b border-black/10 text-[9px] uppercase font-bold tracking-widest text-black/40">
                              <tr>
                                <th className="px-5 py-4">Артикул</th>
                                <th className="px-5 py-4">Наименование</th>
                                <th className="px-5 py-4">Результат</th>
                                <th className="px-5 py-4">Код</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5">
                              {results.slice(0, 10).map((res, i) => (
                                <tr key={i} className="hover:bg-[#FBFBFA] transition-colors group">
                                  <td className="px-5 py-4 font-mono text-[11px] text-black/60">{res.targetItem.article}</td>
                                  <td className="px-5 py-4 max-w-[200px] truncate text-black/80">{res.targetItem.name}</td>
                                  <td className="px-5 py-4">
                                    {res.priority > 0 ? (
                                      <span className={cn(
                                        "px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase",
                                        res.priority === 1 ? "bg-green-100 text-green-700" : 
                                        res.priority === 2 ? "bg-blue-100 text-blue-700" :
                                        "bg-amber-100 text-amber-700"
                                      )}>
                                        {res.priority === 1 ? "P1" : res.priority === 2 ? "P2" : "P3"}
                                      </span>
                                    ) : (
                                      <span className="text-red-300 text-[10px] font-bold">—</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-4 font-mono text-[11px] font-medium">{res.matchedItem?.code || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                      <div className="w-20 h-20 bg-[#F5F5F3] rounded-full flex items-center justify-center mb-6">
                        <FileUp className="w-8 h-8 text-black/20" />
                      </div>
                      <p className="text-lg font-bold tracking-tight mb-2">Загрузите файлы для начала</p>
                      <p className="text-xs text-black/40 max-w-[300px] leading-relaxed uppercase tracking-widest">
                        Алгоритм сопоставит товары по артикулу, бренду и семантике
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto px-6 py-16 border-t border-black/5 mt-12 grid grid-cols-1 md:grid-cols-3 gap-12">
        {[
          { title: "Нормализация", desc: "Автоматическая конвертация символов, удаление лишних знаков и расшифровка технических сокращений." },
          { title: "Производители", desc: "Очистка названий от правовых форм (ООО, ОАО) и сопоставление аббревиатур (СААЗ, УМЗ и т.д.)." },
          { title: "Безопасность", desc: "Все расчеты производятся локально в бразуере. Ваши коммерческие данные не покидают устройство." },
        ].map((item, i) => (
          <div key={i} className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/20">{item.title}</h4>
            <p className="text-sm text-black/60 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </footer>
    </div>
  );
}
