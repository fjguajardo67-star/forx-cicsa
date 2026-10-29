export const CATEGORIES = [
  ['cat_carnes', 'Carnes', 'culinary'],
  ['cat_aves', 'Aves', 'culinary'],
  ['cat_pescados', 'Pescados y mariscos', 'culinary'],
  ['cat_lacteos', 'Lácteos y huevo', 'culinary'],
  ['cat_frutas', 'Frutas y verduras', 'culinary'],
  ['cat_abarrotes', 'Abarrotes secos', 'culinary'],
  ['cat_aceites', 'Aceites y grasas', 'culinary'],
  ['cat_panaderia', 'Panadería y tortillas', 'culinary'],
  ['cat_condimentos', 'Condimentos y salsas', 'culinary'],
  ['cat_bebidas_insumo', 'Bebidas usadas como insumo', 'culinary'],
  ['cat_bebidas_reventa', 'Bebidas para reventa', 'non_culinary'],
  ['cat_limpieza', 'Limpieza', 'non_culinary'],
  ['cat_desechables', 'Desechables', 'non_culinary'],
  ['cat_mantenimiento', 'Mantenimiento', 'non_culinary'],
  ['cat_oficina', 'Oficina y administración', 'non_culinary'],
  ['cat_servicios', 'Servicios', 'non_culinary'],
  ['cat_activos', 'Activos y equipo', 'non_culinary'],
  ['cat_cargos', 'Fletes, impuestos y cargos', 'non_culinary'],
  ['cat_sin', 'Sin clasificar', 'pending']
].map(([id, name, type], order) => ({ id, name, type, order, active: true }));

export const COMPANY_RFC = 'CIC190426SD4';
