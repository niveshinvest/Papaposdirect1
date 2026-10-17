import { useMemo } from "react";

export const useFilteredMenu = (menuItems, search, category) => {
  return useMemo(() => {
    const getCat = (i) => i.menu_categories?.name || i.category;

    return menuItems.filter(item =>
      item.name.toLowerCase().includes(search.toLowerCase()) &&
      (category === "All" || getCat(item) === category)
    );
  }, [menuItems, search, category]);
};