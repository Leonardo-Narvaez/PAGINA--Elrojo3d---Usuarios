-- ============================================================
-- @Elrojo.3d — Migración: catálogo 2026
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Reemplaza categorías y productos del catálogo con los datos
-- del Excel 2026 (10 categorías, 26 productos).
-- ============================================================

-- CATEGORÍAS ----------------------------------------------------
insert into public.categorias (id, nombre, orden) values
    ('llaveros', 'Llaveros', 1),
    ('soporte', 'Soporte', 2),
    ('mascotas', 'Mascotas', 3),
    ('personalizados', 'Personalizados', 4),
    ('temporada', 'Temporada', 5),
    ('bolsas', 'Bolsas', 6),
    ('impresion', 'Impresión', 7),
    ('cuadros', 'Cuadros', 8),
    ('gancho', 'Gancho', 9),
    ('iman', 'Imanes', 10)
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden;

-- elimina las categorías antiguas que ya no se usan
delete from public.categorias where id in ('accesorios', 'identificacion');

-- PRODUCTOS -----------------------------------------------------
-- precio = valor mínimo del rango del Excel (la página muestra "Desde $X")
-- pe-per y tpp sin precio definido -> precio 0 (el sitio muestra "Cotizar")
insert into public.productos (slug, nombre, descripcion, descripcion_corta, precio, img, categoria, disponible, feats) values
('ve-plv', 'Placa Vehículos', 'Placa impresa en 3D para tu vehículo. Personalizada con el texto y los colores que quieras.', 'Placa personalizada para tu vehículo.', 12000, 'images/products/placeholder.png', 'llaveros', true, '["Texto y colores personalizados","Material resistente","Acabado de alta calidad","Diseño exclusivo"]'),
('so-scp', 'Soporte Casco/Pared', 'Soporte resistente impreso en 3D para fijar tu casco en la pared o donde prefieras. Fácil instalación y gran resistencia.', 'Soporte resistente para casco o pared.', 15000, 'images/products/placeholder.png', 'soporte', true, '["Instalación sin herramientas","Colores personalizables","Material reforzado","Garantía de fabricación"]'),
('ll-nb', 'Llavero de texto', 'Llavero 100% personalizado con el texto que elijas. El detalle perfecto para tus llaves o para regalar.', 'Personalizado con el texto que quieras.', 8000, 'images/products/placeholder.png', 'llaveros', true, '["Texto a tu elección","Colores personalizables","Ligero y resistente","Ideal para regalo"]'),
('ma-plm', 'Placas de mascotas', 'Placas personalizadas para tus mascotas con su nombre y tu contacto. Resistentes y con estilo.', 'Identificación personalizada para tu mascota.', 10000, 'images/products/placeholder.png', 'mascotas', true, '["Nombre y contacto personalizados","Material resistente","Variedad de colores","Diseño para mascotas"]'),
('cll-ma', 'Collar para mascotas', 'Collar impreso en 3D para tu mascota. Personalizado, liviano y con excelente acabado.', 'Collar impreso en 3D personalizado.', 6000, 'images/products/placeholder.png', 'mascotas', true, '["Personalizable","Ligero y cómodo","Resistente","Colores a elección"]'),
('pe-per', 'Personalizado', '¿Tienes una idea? La hacemos realidad. Cuéntanos qué necesitas y te cotizamos tu producto personalizado.', 'Tu idea hecha realidad en 3D.', 0, 'images/products/placeholder.png', 'personalizados', true, '["Diseño a tu medida","Materiales de calidad","Cotización personalizada","Proceso guiado"]'),
('pe-bdn', 'Bolas de navidad', 'Bolas decorativas impresas en 3D para decorar tu navidad. Personalizables con nombres y colores.', 'Bolas decorativas personalizables.', 10000, 'images/products/placeholder.png', 'temporada', true, '["Personalizables con nombres","Colores navideños","Duraderas","Ideal para regalar"]'),
('ll-lch', 'Llavero casco helmet', 'Llavero con forma de casco para motociclistas. Personalizado con tus colores favoritos.', 'Llavero con forma de casco.', 12000, 'images/products/placeholder.png', 'llaveros', true, '["Diseño de casco","Colores personalizables","Ligero y resistente","Perfecto para moteros"]'),
('so-plc', 'Porta llavero casco', 'Accesorio impreso en 3D para llevar tus llaves en el casco. Práctico y con estilo.', 'Lleva tus llaves en el casco.', 20000, 'images/products/placeholder.png', 'soporte', true, '["Fácil instalación","Resistente","Colores personalizables","Ideal para moteros"]'),
('ll-ltb', 'Llavero de Tiburón', 'Llavero con diseño de tiburón. Original, llamativo y personalizable.', 'Llavero original con diseño de tiburón.', 15000, 'images/products/placeholder.png', 'llaveros', true, '["Diseño exclusivo","Colores personalizables","Ligero y resistente","Llamativo y original"]'),
('ll-fm', 'Llavero Flor Margarita', 'Llavero con diseño de flor margarita. Delicado, bonito y personalizable.', 'Llavero con diseño de margarita.', 6000, 'images/products/placeholder.png', 'llaveros', true, '["Diseño floral","Colores personalizables","Ligero","Ideal para regalo"]'),
('ll-m', 'Llavero Mariposa', 'Llavero con diseño de mariposa. Perfecto para regalar, personalizable en colores.', 'Llavero con diseño de mariposa.', 6000, 'images/products/placeholder.png', 'llaveros', true, '["Diseño de mariposa","Colores personalizables","Ligero","Ideal para regalo"]'),
('ll-dl', 'Llavero AbreLata', 'Llavero con abrelatas incorporado. Práctico, útil y personalizable.', 'Llavero con abrelatas incorporado.', 10000, 'images/products/placeholder.png', 'llaveros', true, '["Abrelatas incorporado","Práctico y funcional","Colores personalizables","Ligero"]'),
('bd', 'Bolsas Decorativas TELA/HOLOGRAFICAS', 'Bolsas decorativas en tela u holográficas para acompañar tus productos personalizados. Ideal para entregas y regalos.', 'Bolsas decorativas en tela u holográficas.', 2000, 'images/products/placeholder.png', 'bolsas', true, '["Tela u holográficas","Varios diseños","Ideal para regalo","Económicas"]'),
('tpp', 'Toppers variedad', 'Toppers personalizados para tus eventos. Cuéntanos la ocasión y lo hacemos realidad.', 'Toppers personalizados para eventos.', 0, 'images/products/placeholder.png', 'personalizados', true, '["Diseño a tu medida","Variedad de temáticas","Cotización personalizada","Acabado de calidad"]'),
('k-fp', 'Kit de fotos polaroid x5', 'Kit de 5 fotos impresas estilo polaroid. Perfecto para tus recuerdos y regalos.', 'Kit de 5 fotos estilo polaroid.', 5000, 'images/products/placeholder.png', 'personalizados', true, '["5 fotos incluidas","Estilo polaroid","Ideal para regalo","Personalizable"]'),
('impr', 'Hoja-impresion', 'Servicio de impresión 3D por hoja. Envíanos tu diseño y lo imprimimos por ti.', 'Impresión 3D por hoja.', 3000, 'images/products/placeholder.png', 'impresion', true, '["Impresión por hoja","Materiales de calidad","Acabado profesional","Envío a todo Colombia"]'),
('ll-tr', 'Llavero Trasparente Rectangular', 'Llavero transparente rectangular donde puedes insertar tu foto o texto. Ideal para regalar.', 'Llavero transparente rectangular.', 8000, 'images/products/placeholder.png', 'llaveros', true, '["Transparente y elegante","Insertable con foto/texto","Ligero","Ideal para regalo"]'),
('ll-tc', 'Llavero Trasparente Circular', 'Llavero transparente circular con espacio para tu foto o texto. Moderno y personalizable.', 'Llavero transparente circular.', 8000, 'images/products/placeholder.png', 'llaveros', true, '["Transparente y elegante","Insertable con foto/texto","Ligero","Ideal para regalo"]'),
('ll-rc', 'Llavero Resina Circular', 'Llavero circular en resina con acabado brillante. Personalizable en colores.', 'Llavero circular en resina.', 10000, 'images/products/placeholder.png', 'llaveros', true, '["Acabado en resina","Brillante y duradero","Colores personalizables","Ligero"]'),
('ll-ra-z', 'Llavero Resina A-Z#', 'Llavero de resina con la inicial que quieras, de la A a la Z. Perfecto para regalar.', 'Llavero de resina con inicial.', 10000, 'images/products/placeholder.png', 'llaveros', true, '["Inicial de la A a la Z","Acabado en resina","Colores personalizables","Ideal para regalo"]'),
('ll-plar', 'Llavero PLA+Resina 5x4', 'Llavero combinado en PLA y resina, tamaño 5x4. Resistente y con acabado premium.', 'Llavero PLA + resina 5x4.', 10000, 'images/products/placeholder.png', 'llaveros', true, '["Combinación PLA + resina","Tamaño 5x4","Acabado premium","Colores personalizables"]'),
('c-c', 'Cuadros + collage', 'Cuadros y collages personalizados. Contáctanos para conocer los tamaños y precios disponibles.', 'Cuadros y collages personalizados.', 10000, 'images/products/placeholder.png', 'cuadros', true, '["Varios tamaños","Diseño personalizado","Acabado profesional","Ideal para regalo"]'),
('pn', 'Pin', 'Pin personalizado impreso en 3D. Ideal para campañas, eventos o colección.', 'Pin personalizado impreso en 3D.', 7000, 'images/products/placeholder.png', 'gancho', true, '["Personalizable","Ligero","Varios diseños","Resistente"]'),
('im', 'Imanes', 'Imanes personalizados impresos en 3D. Decorativos y prácticos para tu nevera o pizarra.', 'Imanes personalizados.', 7000, 'images/products/placeholder.png', 'iman', true, '["Personalizables","Varios diseños","Decorativos","Resistentes"]')
on conflict (slug) do update set
    nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    descripcion_corta = excluded.descripcion_corta,
    precio = excluded.precio,
    img = excluded.img,
    categoria = excluded.categoria,
    disponible = excluded.disponible,
    feats = excluded.feats;

-- elimina los productos de ejemplo del catálogo anterior
delete from public.productos where slug in ('soporte-casco', 'llaveros', 'placas');