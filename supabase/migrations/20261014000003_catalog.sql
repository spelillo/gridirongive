-- Gear catalog and starter templates. Price ranges come from sean's
-- equipment notes (Book1.xlsx). Prices are in cents.

insert into gear_catalog (sport, category, name, description, price_min_cents, price_max_cents, default_price_cents, safety_note, sizes, positions, sort) values
  ('football', 'Protection', 'Helmet', 'Riddell SpeedFlex, Schutt F7 or equal', 25000, 45000, 30000,
   'Helmets must be new or certified reconditioned within the last 12 months (NOCSAE).', '{S,M,L,XL}', '{}', 10),
  ('football', 'Protection', 'Shoulder Pads', 'Position-specific pads', 15000, 30000, 20000, null, '{S,M,L,XL,XXL}', '{}', 20),
  ('football', 'Protection', 'Girdle', 'Compression girdle with hip and tailbone pads', 3000, 6000, 4000, null, '{S,M,L,XL,XXL}', '{}', 30),
  ('football', 'Protection', 'Rib Protector', 'Padded rib and back shirt', 3000, 7000, 4500, null, '{S,M,L,XL}', '{QB,RB,WR}', 40),
  ('football', 'Protection', 'Back Plate', 'Lower back protection that attaches to shoulder pads', 3000, 6000, 4000, null, '{}', '{QB,RB}', 45),
  ('football', 'Protection', 'Mouthguard', 'Strapped mouthguard', 1000, 2500, 1500, 'Required by NFHS rules. Must be a visible color.', '{}', '{}', 50),
  ('football', 'Footwear', 'Cleats', 'Molded or detachable football cleats', 6000, 15000, 9000, null, '{}', '{}', 60),
  ('football', 'Footwear', 'Kicking Cleats', 'Low-cut kicking cleats', 7000, 16000, 10000, null, '{}', '{K,P}', 65),
  ('football', 'Apparel', 'Integrated Padded Pants', 'Practice pants with built-in pads', 4000, 8000, 6000, null, '{S,M,L,XL,XXL}', '{}', 70),
  ('football', 'Apparel', 'Practice Jersey', 'Mesh practice jersey', 2000, 4000, 3000, null, '{S,M,L,XL,XXL}', '{}', 80),
  ('football', 'Apparel', 'Game Jersey', 'Team game jersey with number', 5000, 12000, 8000, null, '{S,M,L,XL,XXL}', '{}', 90),
  ('football', 'Accessories', 'Gloves', 'Receiver or all-purpose gloves', 3000, 6500, 4500, null, '{S,M,L,XL}', '{}', 100),
  ('football', 'Accessories', 'Lineman Gloves', 'Padded lineman gloves', 3500, 7000, 5000, null, '{M,L,XL,XXL}', '{OL,DL}', 105),
  ('football', 'Accessories', 'Chin Strap', 'Hard-cup chin strap', 1500, 3500, 2500, null, '{}', '{}', 110),
  ('football', 'Accessories', 'Visor', 'Clear eye shield', 4000, 9000, 6000, null, '{}', '{}', 120),
  ('football', 'Team equipment', 'Tackling Sled', 'Two-man sled for practice', 50000, 150000, 90000, null, '{}', '{}', 900),
  ('football', 'Team equipment', 'Practice Jersey Set', 'Set of 50 reversible practice jerseys', 60000, 150000, 90000, null, '{}', '{}', 910),
  ('football', 'Team equipment', 'Kicking Net', 'Portable kicking net', 15000, 40000, 25000, null, '{}', '{}', 920),
  ('hockey', 'Footwear', 'Skates', null, 15000, 60000, 25000, null, '{}', '{}', 10),
  ('hockey', 'Gear', 'Hockey Stick', null, 5000, 25000, 12000, null, '{}', '{}', 20),
  ('hockey', 'Protection', 'Helmet with Cage', null, 10000, 25000, 15000, 'Must carry a current HECC certification sticker.', '{S,M,L}', '{}', 30),
  ('hockey', 'Protection', 'Hockey Gloves', null, 7000, 18000, 10000, null, '{}', '{}', 40),
  ('hockey', 'Protection', 'Shoulder Pads', null, 7000, 18000, 10000, null, '{S,M,L,XL}', '{}', 50),
  ('hockey', 'Protection', 'Elbow Pads', null, 4000, 9000, 6000, null, '{S,M,L}', '{}', 60),
  ('hockey', 'Protection', 'Shin Guards', null, 4000, 9000, 6000, null, '{}', '{}', 70),
  ('hockey', 'Apparel', 'Hockey Pants', null, 6000, 16000, 9000, null, '{S,M,L,XL}', '{}', 80),
  ('hockey', 'Protection', 'Neck Guard', null, 1500, 3000, 2000, null, '{}', '{}', 90),
  ('lacrosse', 'Protection', 'Lacrosse Helmet', null, 20000, 35000, 25000, 'Must meet the NOCSAE lacrosse standard.', '{}', '{}', 10),
  ('lacrosse', 'Gear', 'Lacrosse Stick (Complete)', null, 6000, 20000, 10000, null, '{}', '{}', 20),
  ('lacrosse', 'Protection', 'Shoulder Pads (ND200 Compliant)', null, 7000, 15000, 10000, null, '{S,M,L}', '{}', 30),
  ('lacrosse', 'Protection', 'Lacrosse Gloves', null, 5000, 18000, 9000, null, '{S,M,L}', '{}', 40),
  ('lacrosse', 'Protection', 'Arm Pads', null, 6000, 13000, 8000, null, '{S,M,L}', '{}', 50),
  ('lacrosse', 'Protection', 'Rib Pads', null, 3000, 7000, 4500, null, '{S,M,L}', '{}', 60),
  ('lacrosse', 'Protection', 'Mouthguard', null, 1000, 2500, 1500, null, '{}', '{}', 70),
  ('baseball', 'Gear', 'Baseball Glove', null, 5000, 30000, 12000, null, '{}', '{}', 10),
  ('baseball', 'Gear', 'BBCOR/USSSA Bat', null, 15000, 45000, 25000, null, '{}', '{}', 20),
  ('baseball', 'Protection', 'Batting Helmet', null, 4000, 9000, 6000, 'Must meet the NOCSAE baseball standard.', '{S,M,L}', '{}', 30),
  ('baseball', 'Accessories', 'Batting Gloves', null, 2000, 5000, 3000, null, '{S,M,L,XL}', '{}', 40),
  ('baseball', 'Protection', 'Catcher''s Gear Set', null, 15000, 40000, 25000, null, '{}', '{C}', 50),
  ('baseball', 'Apparel', 'Baseball Pants', null, 2000, 5000, 3500, null, '{S,M,L,XL}', '{}', 60),
  ('baseball', 'Accessories', 'Equipment Bag', null, 3000, 10000, 5000, null, '{}', '{}', 70);

-- System templates (team_id null). Teams copy one when they're created.
create function seed_template(p_sport text, p_name text, p_positions text[], p_items text[]) returns uuid
language plpgsql as $$
declare
  tid uuid;
  item text;
  i int := 0;
begin
  insert into gear_templates (sport, name, positions) values (p_sport, p_name, p_positions) returning id into tid;
  foreach item in array p_items loop
    i := i + 1;
    insert into gear_template_items (template_id, catalog_id, price_cents, sort)
    select tid, c.id, c.default_price_cents, i from gear_catalog c where c.sport = p_sport and c.name = item;
  end loop;
  return tid;
end $$;

select seed_template('football', 'Standard kit', '{}',
  '{Helmet,"Shoulder Pads","Integrated Padded Pants",Girdle,Cleats,Mouthguard,Gloves,"Practice Jersey"}');
select seed_template('football', 'Lineman', '{OL,DL}',
  '{Helmet,"Shoulder Pads","Integrated Padded Pants",Girdle,Cleats,Mouthguard,"Lineman Gloves","Practice Jersey"}');
select seed_template('football', 'Skill position', '{RB,WR,TE,LB,CB,S,DB}',
  '{Helmet,"Shoulder Pads","Integrated Padded Pants",Girdle,Cleats,Mouthguard,Gloves,"Practice Jersey"}');
select seed_template('football', 'Kicker/Punter', '{K,P}',
  '{Helmet,"Shoulder Pads","Integrated Padded Pants","Kicking Cleats",Mouthguard,"Practice Jersey"}');
select seed_template('football', 'QB', '{QB}',
  '{Helmet,"Shoulder Pads","Rib Protector","Integrated Padded Pants",Girdle,Cleats,Mouthguard,Gloves}');
select seed_template('hockey', 'Standard kit', '{}',
  '{Skates,"Hockey Stick","Helmet with Cage","Hockey Gloves","Shoulder Pads","Elbow Pads","Shin Guards","Hockey Pants","Neck Guard"}');
select seed_template('lacrosse', 'Standard kit', '{}',
  '{"Lacrosse Helmet","Lacrosse Stick (Complete)","Shoulder Pads (ND200 Compliant)","Lacrosse Gloves","Arm Pads",Mouthguard}');
select seed_template('baseball', 'Standard kit', '{}',
  '{"Baseball Glove","BBCOR/USSSA Bat","Batting Helmet","Batting Gloves","Baseball Pants","Equipment Bag"}');

drop function seed_template(text, text, text[], text[]);
