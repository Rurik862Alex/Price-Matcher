
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 'c', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ы': 'y', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

// Common abbreviations in Russian price lists
export const ABBREVIATIONS: Record<string, string> = {
  'зад.': 'задний',
  'пер.': 'передний',
  'торм.': 'тормозной',
  'лев.': 'левый',
  'прав.': 'правый',
  'верх.': 'верхний',
  'ниж.': 'нижний',
  'внутр.': 'внутренний',
  'наруж.': 'наружный',
  'компл.': 'комплект',
  'цил.': 'цилиндр',
  'двиг.': 'двигатель',
};

// Manufacturer normalization
export const MF_CLEANUP = [
  /\bоао\b/gi, /\bооо\b/gi, /\bао\b/gi, /\bзао\b/gi, /\bпкф\b/gi,
  /\bн\.новгород\b/gi, /\bг\.\b/gi, /\bроссия\b/gi
];

export const MF_MAP: Record<string, string> = {
  'умз': 'ульяновский моторный завод',
  'сааз': 'скопинский автоагрегатный завод',
  'низ': 'новосибирский инструментальный завод',
  'змз': 'заволжский моторный завод',
  'газ': 'горьковский автомобильный завод',
  'ваз': 'волжский автомобильный завод',
  'прочее': 'прочее',
  'noname': 'прочее',
  'прзп': 'прочее',
  'китай': 'прочее',
  'кнр': 'прочее',
  'noname/китай': 'прочее',
  'unknown': 'прочее',
};
