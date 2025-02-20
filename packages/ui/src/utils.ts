export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
  ) {
    let timeoutId: ReturnType<typeof setTimeout>;
  
    const debounced = (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), wait);
    };
  
    debounced.cancel = () => {
      clearTimeout(timeoutId);
    };
  
    return debounced;
  }
  