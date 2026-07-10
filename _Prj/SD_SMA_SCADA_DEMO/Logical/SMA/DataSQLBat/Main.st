
PROGRAM _INIT
	UtcDTGetTime_0.enable := TRUE;
	UtcDTGetTime_0();
	IF UtcDTGetTime_0.status = 0 THEN
		dtNow := UtcDTGetTime_0.DT1;
	END_IF

	diBatchSeq := 1;
	bSimEnable := TRUE;
	bBatchOpened := TRUE;

	(*Initial gDataSQLBatch (DataSQLBatch_typ)*)
	gDataSQLBatch.BatchCode := 'BATCH_001';
	gDataSQLBatch.BatchTimeStart := dtNow;
	gDataSQLBatch.BatchTimeStop := DT#1970-01-01-00:00:00;

	(*Initial gDataSQLBatchInfo (DataSQLBatchInfo_typ)*)
	gDataSQLBatchInfo.InfoProductName := 'DemoTablet';
	gDataSQLBatchInfo.InfoProductDesc := 'SMA DEMO Product';
	gDataSQLBatchInfo.InfoConfigure := 'CFG_DEMO';
	gDataSQLBatchInfo.InfoRecipe := 'RCP_DEMO';
	gDataSQLBatchInfo.InfoTabletMoldXY := 'ROUND';
	gDataSQLBatchInfo.InfoTabletMoldZ := 'FLAT';
	gDataSQLBatchInfo.InfoBatchStart := dtNow;
	gDataSQLBatchInfo.InfoBatchStop := DT#1970-01-01-00:00:00;
END_PROGRAM

PROGRAM _CYCLIC
	UtcDTGetTime_0.enable := TRUE;
	UtcDTGetTime_0();
	IF UtcDTGetTime_0.status = 0 THEN
		dtNow := UtcDTGetTime_0.DT1;
	END_IF

	(*Shared heartbeat for collector*)
	gDataSQLHeartBeat := gDataSQLHeartBeat + 1;

	(*Fill gDataSQLBatch, then set BatchInsert (~60s open/close cycle)*)
	tonBatch(IN := bSimEnable AND NOT gDataSQLOperate.BatchInsert, PT := T#60s);
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
			gDataSQLBatch.BatchTimeStart := dtNow;
			gDataSQLBatch.BatchTimeStop := DT#1970-01-01-00:00:00;
			gDataSQLBatchInfo.InfoBatchStart := dtNow;
			gDataSQLBatchInfo.InfoBatchStop := DT#1970-01-01-00:00:00;
			bBatchOpened := TRUE;
		ELSE
			gDataSQLBatch.BatchTimeStop := dtNow;
			gDataSQLBatchInfo.InfoBatchStop := dtNow;
			gDataSQLBatchInfo.InfoBatchRun := dtNow - gDataSQLBatchInfo.InfoBatchStart;
			bBatchOpened := FALSE;
		END_IF
		gDataSQLOperate.BatchInsert := TRUE;
	END_IF

	(*Fill gDataSQLBatchInfo, then set BatchInfoInsert (~15s)*)
	tonBatchInfo(IN := bSimEnable AND NOT gDataSQLOperate.BatchInfoInsert, PT := T#15s);
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
		gDataSQLBatchInfo.InfoPieceAccept := DINT_TO_UDINT(RandRange(100, 5000));
		gDataSQLBatchInfo.InfoPieceDebug := DINT_TO_UDINT(RandRange(0, 50));
		gDataSQLBatchInfo.InfoPieceTotal := gDataSQLBatchInfo.InfoPieceAccept + gDataSQLBatchInfo.InfoPieceDebug;
		IF bBatchOpened THEN
			gDataSQLBatchInfo.InfoBatchRun := dtNow - gDataSQLBatchInfo.InfoBatchStart;
		END_IF
		gDataSQLOperate.BatchInfoInsert := TRUE;
	END_IF
END_PROGRAM

PROGRAM _EXIT

END_PROGRAM
