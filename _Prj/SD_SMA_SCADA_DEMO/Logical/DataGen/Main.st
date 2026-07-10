
PROGRAM _INIT
	(* Insert code here *)
	UtcDTGetTime_0.enable := TRUE;
	UtcDTGetTime_0();
	IF UtcDTGetTime_0.status = 0 THEN
		dtBtachStartTime := UtcDTGetTime_0.DT1;
		dtBtachEndTime := UtcDTGetTime_0.DT1;
		dtSQLNow := UtcDTGetTime_0.DT1;
	END_IF
	strBatchCode := 'SCP173';
	bBatchTriger := FALSE;
	bDataSQLSimEnable := TRUE;
	diBatchSeq := 1;
	gDataSQLBatch.BatchCode := 'BATCH_001';
	gDataSQLBatch.BatchTimeStart := dtSQLNow;
	gDataSQLBatch.BatchTimeStop := DT#1970-01-01-00:00:00;
	gDataSQLBatchInfo.InfoProductName := 'DemoTablet';
	gDataSQLBatchInfo.InfoProductDesc := 'SMA DEMO Product';
	gDataSQLBatchInfo.InfoConfigure := 'CFG_DEMO';
	gDataSQLBatchInfo.InfoRecipe := 'RCP_DEMO';
	gDataSQLBatchInfo.InfoTabletMoldXY := 'ROUND';
	gDataSQLBatchInfo.InfoTabletMoldZ := 'FLAT';
	gDataSQLBatchInfo.InfoBatchStart := dtSQLNow;
	bBatchOpened := TRUE;
END_PROGRAM

PROGRAM _CYCLIC
	(* Insert code here *)
	strTimeStamp;
	strTimeStamp := DT_TO_STRING(dtTimeStamp);
	IP1 := RandINT();
	IP2 := RandINT();

	FP1 := RandRangeReal(0, 100);
	FP2 := RandRangeReal(0, 100);

	CV := RandRangeReal(0, 100);
	VPF := RandRangeReal(0, 100);
	WT := RandRangeReal(0, 100);

	F1 := RandRangeReal(0, 100);
	F2 := RandRangeReal(0, 100);
	F3 := RandRangeReal(0, 100);
	F4 := RandRangeReal(0, 100);
	F5 := RandRangeReal(0, 100);
	F6 := RandRangeReal(0, 100);
	F7 := RandRangeReal(0, 100);
	F8 := RandRangeReal(0, 100);
	F9 := RandRangeReal(0, 100);
	F10 := RandRangeReal(0, 100);
	F11 := RandRangeReal(0, 100);
	F12 := RandRangeReal(0, 100);
	F13 := RandRangeReal(0, 100);
	F14 := RandRangeReal(0, 100);
	F15 := RandRangeReal(0, 100);

	FP := RandRangeReal(0, 100);

	AP1 := RandRangeReal(0, 100);
	BP1 := RandRangeReal(0, 100);
	AP2 := RandRangeReal(0, 100);

	ST1 := RandRangeReal(0, 100);
	ST2 := RandRangeReal(0, 100);
	ST3 := RandRangeReal(0, 100);
	ST4 := RandRangeReal(0, 100);
	ST5 := RandRangeReal(0, 100);
	ST6 := RandRangeReal(0, 100);
	ST7 := RandRangeReal(0, 100);
	ST8 := RandRangeReal(0, 100);
	ST9 := RandRangeReal(0, 100);
	ST10 := RandRangeReal(0, 100);
	ST11 := RandRangeReal(0, 100);
	ST12 := RandRangeReal(0, 100);
	ST13 := RandRangeReal(0, 100);
	ST14 := RandRangeReal(0, 100);
	ST15 := RandRangeReal(0, 100);

	AIR := RandRangeReal(0, 100);
	CP := RandRangeReal(0, 100);
	CT := RandRangeReal(0, 100);
	CRT := RandRangeReal(0, 100);
	ES := RandRangeReal(0, 100);
	FT := RandRangeReal(0, 100);
	FF := RandRangeReal(0, 100);

	FC := RandINT();

	HT1 := RandRangeReal(0, 100);
	HT2 := RandRangeReal(0, 100);
	HT3 := RandRangeReal(0, 100);
	HT4 := RandRangeReal(0, 100);
	HT5 := RandRangeReal(0, 100);
	HT6 := RandRangeReal(0, 100);
	HT7 := RandRangeReal(0, 100);
	HT8 := RandRangeReal(0, 100);
	HT9 := RandRangeReal(0, 100);
	HT10 := RandRangeReal(0, 100);
	HT11 := RandRangeReal(0, 100);
	HT12 := RandRangeReal(0, 100);
	HT13 := RandRangeReal(0, 100);
	HT14 := RandRangeReal(0, 100);
	HT15 := RandRangeReal(0, 100);
	HT16 := RandRangeReal(0, 100);
	HT17 := RandRangeReal(0, 100);
	HT18 := RandRangeReal(0, 100);
	HT19 := RandRangeReal(0, 100);
	HT20 := RandRangeReal(0, 100);

	MP := RandRangeReal(0, 100);
	MT := RandRangeReal(0, 100);
	MCT := RandRangeReal(0, 100);
	MCP := RandRangeReal(0, 100);
	EC := RandRangeReal(0, 100);
	EST := RandRangeReal(0, 100);
	ES1 := RandRangeReal(0, 100);
	TC := RandRangeReal(0, 100);
	TF := RandRangeReal(0, 100);
	TW := RandRangeReal(0, 100);

	(*******************************************************
	 * DataSQL 随机数据 / 插入触发 (匹配 sma_data_collect)
	 *******************************************************)
	UtcDTGetTime_0.enable := TRUE;
	UtcDTGetTime_0();
	IF UtcDTGetTime_0.status = 0 THEN
		dtSQLNow := UtcDTGetTime_0.DT1;
		dtTimeStamp := dtSQLNow;
	END_IF

	(*心跳：采集端也会写；本地缓慢递增便于观察*)
	gDataSQLHeartBeat := gDataSQLHeartBeat + 1;

	IF bDataSQLSimEnable THEN
		(*配方数据 ~5s*)
		tonRecipe(IN := NOT gDataSQLOperate.RecipeInsert, PT := T#5s);
		IF EDGEPOS(tonRecipe.Q) THEN
			gDataSQLRecipe.TimeStamp := dtSQLNow;
			gDataSQLRecipe.State := 1;
			gDataSQLRecipe.CH00 := RandRangeReal(20, 80);
			gDataSQLRecipe.CH01 := RandRangeReal(2, 6);
			gDataSQLRecipe.CH02 := RandRangeReal(10, 40);
			gDataSQLRecipe.CH03 := RandRangeReal(0.1, 2);
			gDataSQLRecipe.CH04 := RandRangeReal(0.1, 2);
			gDataSQLRecipe.CH05 := RandRangeReal(2, 6);
			gDataSQLRecipe.CH06 := RandRangeReal(5, 20);
			gDataSQLRecipe.CH07 := RandRangeReal(0.1, 2);
			gDataSQLRecipe.CH08 := RandRangeReal(0.1, 2);
			gDataSQLRecipe.CH09 := RandRangeReal(2, 6);
			gDataSQLRecipe.CH10 := RandRangeReal(10, 40);
			gDataSQLRecipe.CH11 := RandRangeReal(0.1, 2);
			gDataSQLRecipe.CH12 := RandRangeReal(0.1, 2);
			gDataSQLRecipe.CH13 := RandRangeReal(2, 6);
			gDataSQLRecipe.CH14 := RandRangeReal(5, 20);
			gDataSQLRecipe.CH15 := RandRangeReal(0.1, 2);
			gDataSQLRecipe.CH16 := RandRangeReal(0.1, 2);
			gDataSQLRecipe.CH17 := RandRangeReal(5, 15);
			gDataSQLRecipe.CH18 := RandRangeReal(5, 15);
			gDataSQLRecipe.CH19 := RandRangeReal(10, 50);
			gDataSQLRecipe.CH20 := RandRangeReal(10, 50);
			gDataSQLRecipe.CH21 := RandRangeReal(50, 150);
			gDataSQLRecipe.CH22 := RandRangeReal(50, 150);
			gDataSQLRecipe.CH23 := 0;
			gDataSQLRecipe.CH24 := 0;
			gDataSQLRecipe.CH25 := 0;
			gDataSQLOperate.RecipeInsert := TRUE;
		END_IF

		(*生产数据 ~2s*)
		tonProduct(IN := NOT gDataSQLOperate.ProductInsert, PT := T#2s);
		IF EDGEPOS(tonProduct.Q) THEN
			gDataSQLProduct.TimeStamp := dtSQLNow;
			gDataSQLProduct.State := 2;
			gDataSQLProduct.CH01 := RandRangeReal(5, 15);
			gDataSQLProduct.CH02 := RandRangeReal(2, 6);
			gDataSQLProduct.CH03 := RandRangeReal(0.8, 1.2);
			gDataSQLProduct.CH04 := RandRangeReal(5, 15);
			gDataSQLProduct.CH05 := RandRangeReal(2, 6);
			gDataSQLProduct.CH06 := RandRangeReal(0.8, 1.2);
			udiPieceAccept := udiPieceAccept + DINT_TO_UDINT(RandRange(1, 5));
			udiPieceDebug := udiPieceDebug + DINT_TO_UDINT(RandRange(0, 1));
			udiPieceTotal := udiPieceAccept + udiPieceDebug;
			gDataSQLOperate.ProductInsert := TRUE;
		END_IF

		(*批次开批/结批 ~60s 一轮：先开批再结批*)
		tonBatch(IN := NOT gDataSQLOperate.BatchInsert, PT := T#60s);
		IF EDGEPOS(tonBatch.Q) THEN
			IF NOT bBatchOpened THEN
				diBatchSeq := diBatchSeq + 1;
				IF diBatchSeq > 999 THEN
					diBatchSeq := 1;
				END_IF
				strTmp := '';
				brsitoa(diBatchSeq, ADR(strTmp));
				gDataSQLBatch.BatchCode := 'BATCH_';
				brsstrcat(ADR(gDataSQLBatch.BatchCode), ADR(strTmp));
				gDataSQLBatch.BatchTimeStart := dtSQLNow;
				gDataSQLBatch.BatchTimeStop := DT#1970-01-01-00:00:00;
				gDataSQLBatchInfo.InfoBatchStart := dtSQLNow;
				gDataSQLBatchInfo.InfoBatchStop := DT#1970-01-01-00:00:00;
				udiPieceAccept := 0;
				udiPieceDebug := 0;
				udiPieceTotal := 0;
				bBatchOpened := TRUE;
			ELSE
				gDataSQLBatch.BatchTimeStop := dtSQLNow;
				gDataSQLBatchInfo.InfoBatchStop := dtSQLNow;
				gDataSQLBatchInfo.InfoBatchRun := dtSQLNow - gDataSQLBatchInfo.InfoBatchStart;
				bBatchOpened := FALSE;
			END_IF
			gDataSQLOperate.BatchInsert := TRUE;
		END_IF

		(*批次信息 ~15s*)
		tonBatchInfo(IN := NOT gDataSQLOperate.BatchInfoInsert, PT := T#15s);
		IF EDGEPOS(tonBatchInfo.Q) THEN
			gDataSQLBatchInfo.InfoProductName := 'DemoTablet';
			gDataSQLBatchInfo.InfoProductDesc := 'SMA DEMO Product';
			gDataSQLBatchInfo.InfoConfigure := 'CFG_DEMO';
			gDataSQLBatchInfo.InfoRecipe := 'RCP_DEMO';
			gDataSQLBatchInfo.InfoTabletWeight := RandRangeReal(0.1, 1.5);
			gDataSQLBatchInfo.InfoTabletHardness := RandRangeReal(20, 80);
			gDataSQLBatchInfo.InfoTabletMoldXY := 'ROUND';
			gDataSQLBatchInfo.InfoTabletDiameterX := RandRangeReal(5, 12);
			gDataSQLBatchInfo.InfoTabletDiameterY := RandRangeReal(5, 12);
			gDataSQLBatchInfo.InfoTabletMoldZ := 'FLAT';
			gDataSQLBatchInfo.InfoTabletThicknessZ := RandRangeReal(2, 6);
			gDataSQLBatchInfo.InfoTabletRadiusR := RandRangeReal(0.5, 3);
			gDataSQLBatchInfo.InfoPieceAccept := udiPieceAccept;
			gDataSQLBatchInfo.InfoPieceDebug := udiPieceDebug;
			gDataSQLBatchInfo.InfoPieceTotal := udiPieceTotal;
			IF bBatchOpened THEN
				gDataSQLBatchInfo.InfoBatchRun := dtSQLNow - gDataSQLBatchInfo.InfoBatchStart;
			END_IF
			gDataSQLOperate.BatchInfoInsert := TRUE;
		END_IF
	ELSE
		tonRecipe(IN := FALSE);
		tonProduct(IN := FALSE);
		tonBatch(IN := FALSE);
		tonBatchInfo(IN := FALSE);
	END_IF
END_PROGRAM

PROGRAM _EXIT
	(* Insert code here *)
	 
END_PROGRAM
