from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
import os

app = Flask(__name__)
CORS(app)

def productivity_score(row):
    score = 100
    checkin = str(row.get('Check In Status', '')).lower()
    checkout = str(row.get('Check Out Status', '')).lower()
    emp_status = str(row.get('Employee Status', '')).lower()

    if checkin == 'late': score -= 20
    if checkout == 'early': score -= 20
    if emp_status == 'absent': score -= 50
    return max(0, score)

def calculate_resignation_risk(row):
    score = 0
    checkin = str(row.get('Check In Status', '')).lower()
    checkout = str(row.get('Check Out Status', '')).lower()
    emp_status = str(row.get('Employee Status', '')).lower()
    productivity = row.get('Productivity Score', 100)

    if emp_status == 'absent': score += 25
    if checkin == 'late': score += 10
    if checkout == 'early': score += 10
    if productivity < 50: score += 25
    elif productivity < 80: score += 10
    if emp_status == 'remote': score += 15
    return score

def get_resignation_level(score):
    if score >= 60: return 'High Resignation Risk'
    elif score >= 30: return 'Medium Resignation Risk'
    return 'Low Resignation Risk'

def time_to_minutes(value):
    try:
        if pd.isna(value):
            return 0
        parts = str(value).strip().split(':')
        if len(parts) < 2:
            return 0
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 0

def shift_duration_minutes(value):
    try:
        if pd.isna(value) or 'to' not in str(value).lower():
            return 0
        start, end = [part.strip() for part in str(value).lower().split('to', 1)]
        start_minutes = time_to_minutes(start)
        end_minutes = time_to_minutes(end)
        if not start_minutes or not end_minutes:
            return 0
        if end_minutes < start_minutes:
            end_minutes += 24 * 60
        return end_minutes - start_minutes
    except Exception:
        return 0

def attendance_score(row):
    score = 100
    checkin = str(row.get('Check In Status', '')).lower()
    checkout = str(row.get('Check Out Status', '')).lower()
    emp_status = str(row.get('Employee Status', '')).lower()
    overtime = row.get('Overtime Minutes', 0)

    if emp_status == 'absent':
        score -= 50
    elif emp_status == 'leave':
        score -= 10
    if checkin == 'late':
        score -= 15
    if checkout == 'early':
        score -= 15
    if overtime > 0:
        score += min(10, overtime // 30)
    return int(max(0, min(100, score)))

def clean_for_json(value):
    if isinstance(value, dict):
        return {key: clean_for_json(val) for key, val in value.items()}
    if isinstance(value, list):
        return [clean_for_json(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if pd.isna(value):
        return None
    return value

def mean_absolute_error(actual, predicted):
    if len(actual) == 0:
        return None
    return float(np.mean(np.abs(np.asarray(actual, dtype=float) - np.asarray(predicted, dtype=float))))

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        data = request.json
        filepath = data.get('filepath', '')
        if not filepath:
            return jsonify({'error': 'File path missing'}), 400

        if not os.path.isabs(filepath):
            base_dir = os.path.dirname(__file__)
            project_root = os.path.dirname(base_dir)
            filepath = os.path.normpath(os.path.join(project_root, filepath))

        if not os.path.exists(filepath):
            return jsonify({'error': f'File not found: {filepath}'}), 404

        # Read File
        if filepath.endswith('.csv'):
            try:
                df = pd.read_csv(filepath)
            except:
                df = pd.read_csv(filepath, encoding='latin1')
        elif filepath.endswith('.xlsx') or filepath.endswith('.xls'):
            df = pd.read_excel(filepath)
        else:
            return jsonify({'error': 'Unsupported file format'}), 400

        # Required Columns Verification
        required_columns = ['Date', 'Check In Status', 'Check Out Status', 'Shift Status', 'Source', 'Name']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            return jsonify({'error': 'Missing Columns', 'missing_columns': missing_columns}), 400

        # Clean Strings
        for col in ['Check In Status', 'Check Out Status', 'Shift Status', 'Source', 'Name']:
            df[col] = df[col].astype(str).str.strip()
        
        for col in ['Check In Status', 'Check Out Status', 'Shift Status', 'Source']:
            df[col] = df[col].str.lower()

        df['Date'] = pd.to_datetime(df['Date'])

        refined_rows = []
        # FIX: Grouping by both Name AND Date to support multiple employees correctly
        for (name, date), group in df.groupby(['Name', 'Date']):
            biometric_present = group[(group['Source'] == 'biometric') & (group['Check In Status'] != 'absent')]
            tracker_present = group[(group['Source'] == 'tracker') & (group['Check In Status'] != 'absent')]
            holiday_rows = group[group['Shift Status'] == 'holiday']

            if len(biometric_present) > 0:
                row = biometric_present.iloc[0].copy()
                row['Employee Status'] = 'Office'
            elif len(tracker_present) > 0:
                row = tracker_present.iloc[0].copy()
                row['Employee Status'] = 'Remote'
            elif len(holiday_rows) > 0:
                row = holiday_rows.iloc[0].copy()
                row['Employee Status'] = 'Leave'
            else:
                row = group.iloc[0].copy()
                row['Employee Status'] = 'Absent'

            refined_rows.append(row)

        refined_df = pd.DataFrame(refined_rows).sort_values(['Name', 'Date'])

        # Handle Holidays filling
        holiday_mask = (refined_df['Employee Status'] == 'Leave')
        columns_to_fill = ['Check In (HH:MM)', 'Check In Status', 'Check Out (HH:MM)', 'Check Out Status', 'Status']
        for col in columns_to_fill:
            if col in refined_df.columns:
                refined_df.loc[holiday_mask & (refined_df[col].isna() | (refined_df[col].astype(str).str.lower() == 'nan')), col] = 'Holiday'

        # Scores Calculations
        refined_df['Worked Minutes'] = refined_df['Total Time (HH:MM)'].apply(time_to_minutes) if 'Total Time (HH:MM)' in refined_df.columns else 0
        refined_df['Shift Minutes'] = refined_df['Shift Time (HH:MM)'].apply(shift_duration_minutes) if 'Shift Time (HH:MM)' in refined_df.columns else 0
        refined_df['Overtime Minutes'] = (refined_df['Worked Minutes'] - refined_df['Shift Minutes']).clip(lower=0)
        refined_df['Productivity Score'] = refined_df.apply(productivity_score, axis=1)
        refined_df['Attendance Score'] = refined_df.apply(attendance_score, axis=1)
        refined_df['Resignation Risk Score'] = refined_df.apply(calculate_resignation_risk, axis=1)
        refined_df['Resignation Risk'] = refined_df['Resignation Risk Score'].apply(get_resignation_level)

        # Filters & Aggregations
        high_risk_mask = refined_df['Resignation Risk'] == 'High Resignation Risk'
        high_resignation_risk = refined_df[high_risk_mask][[
            'Name', 'Employee Status', 'Productivity Score', 'Resignation Risk Score', 'Resignation Risk'
        ]].to_dict(orient='records')

        risk_counts = refined_df['Resignation Risk'].value_counts().to_dict()
        status_counts = refined_df['Employee Status'].value_counts().to_dict()

        on_time_count = len(refined_df[refined_df['Check In Status'] == 'ontime'])
        late_login_count = len(refined_df[refined_df['Check In Status'] == 'late'])
        early_login_count = len(refined_df[refined_df['Check In Status'] == 'early'])
        late_logout_count = len(refined_df[refined_df['Check Out Status'] == 'late'])
        early_logout_count = len(refined_df[refined_df['Check Out Status'] == 'early'])
        overtime_count = int((refined_df['Overtime Minutes'] > 0).sum())

        employee_summary = refined_df.groupby('Name').agg(
            total_days=('Date', 'count'),
            office_days=('Employee Status', lambda s: int((s == 'Office').sum())),
            remote_days=('Employee Status', lambda s: int((s == 'Remote').sum())),
            absent_days=('Employee Status', lambda s: int((s == 'Absent').sum())),
            holidays_taken=('Employee Status', lambda s: int((s == 'Leave').sum())),
            late_logins=('Check In Status', lambda s: int((s == 'late').sum())),
            early_logins=('Check In Status', lambda s: int((s == 'early').sum())),
            late_logouts=('Check Out Status', lambda s: int((s == 'late').sum())),
            early_logouts=('Check Out Status', lambda s: int((s == 'early').sum())),
            overtime_minutes=('Overtime Minutes', 'sum'),
            average_attendance_score=('Attendance Score', 'mean'),
            average_productivity_score=('Productivity Score', 'mean'),
            average_resignation_risk_score=('Resignation Risk Score', 'mean')
        ).reset_index()

        employee_summary['total_late_events'] = employee_summary['late_logins'] + employee_summary['late_logouts']
        employee_summary['overtime_hours'] = (employee_summary['overtime_minutes'] / 60).round(2)
        employee_summary['average_attendance_score'] = employee_summary['average_attendance_score'].round(2)
        employee_summary['average_productivity_score'] = employee_summary['average_productivity_score'].round(2)
        employee_summary['average_resignation_risk_score'] = employee_summary['average_resignation_risk_score'].round(2)

        employee_attendance_scores = employee_summary.sort_values(
            ['average_attendance_score', 'total_late_events'],
            ascending=[False, True]
        ).to_dict(orient='records')

        max_late_employees = employee_summary[employee_summary['total_late_events'] > 0].sort_values(
            ['total_late_events', 'late_logins', 'late_logouts'],
            ascending=False
        ).head(10).to_dict(orient='records')

        overtime_employees = employee_summary[employee_summary['overtime_minutes'] > 0].sort_values(
            'overtime_minutes',
            ascending=False
        ).head(10).to_dict(orient='records')

        most_holidays_taken = employee_summary[employee_summary['holidays_taken'] > 0].sort_values(
            'holidays_taken',
            ascending=False
        ).head(10).to_dict(orient='records')

        overtime_points_df = refined_df.groupby('Date').agg(
            overtime_minutes=('Overtime Minutes', 'sum')
        ).reset_index().sort_values('Date')
        overtime_points_df['Date'] = overtime_points_df['Date'].dt.strftime('%Y-%m-%d')
        overtime_points = overtime_points_df.to_dict(orient='records')

        login_logout_comparison = [
            {
                'category': 'Late',
                'login': int(late_login_count),
                'logout': int(late_logout_count)
            },
            {
                'category': 'Early',
                'login': int(early_login_count),
                'logout': int(early_logout_count)
            }
        ]

        # Trend Analysis: daily aggregation + simple linear model + holdout check to avoid overfitting.
        trend_source_df = refined_df[['Date', 'Name', 'Employee Status']].copy()
        trend_source_df['Presence'] = trend_source_df['Employee Status'].apply(lambda x: 1 if x in ['Office', 'Remote'] else 0)
        trend_df = trend_source_df.groupby('Date').agg(
            presence=('Presence', 'mean'),
            sample_size=('Name', 'count')
        ).reset_index().sort_values('Date')
        trend_df['Day_Number'] = np.arange(len(trend_df))

        trend_model_quality = {
            'model': 'LinearRegression',
            'feature': 'Day_Number',
            'target': 'Daily Presence Rate',
            'points': int(len(trend_df)),
            'train_mae': None,
            'validation_mae': None,
            'overfitting_detected': False,
            'reliable': False,
            'note': 'Need at least 3 daily points for a reliable trend.'
        }

        if len(trend_df) >= 3:
            split_index = min(max(2, int(len(trend_df) * 0.8)), len(trend_df) - 1)
            train_df = trend_df.iloc[:split_index]
            validation_df = trend_df.iloc[split_index:]

            model = LinearRegression().fit(train_df[['Day_Number']], train_df['presence'])
            slope = model.coef_[0]
            trend_df['TrendLine'] = model.predict(trend_df[['Day_Number']])

            train_mae = mean_absolute_error(train_df['presence'], model.predict(train_df[['Day_Number']]))
            validation_mae = mean_absolute_error(validation_df['presence'], model.predict(validation_df[['Day_Number']]))
            overfitting_detected = validation_mae is not None and validation_mae > max((train_mae or 0) * 2.5, 0.2)

            trend_model_quality.update({
                'train_mae': round(train_mae, 4) if train_mae is not None else None,
                'validation_mae': round(validation_mae, 4) if validation_mae is not None else None,
                'overfitting_detected': bool(overfitting_detected),
                'reliable': not overfitting_detected,
                'note': 'Trend passed holdout validation.' if not overfitting_detected else 'Validation error is high; treat trend as unstable.'
            })

            if overfitting_detected:
                trend = 'Stable Attendance Pattern'
            else:
                trend = 'Attendance Improving' if slope > 0 else 'Attendance Declining' if slope < 0 else 'Stable Attendance Pattern'
        else:
            slope = 0
            trend_df['TrendLine'] = trend_df['presence'] if len(trend_df) else []
            trend = 'Stable Attendance Pattern'

        trend_df['Date'] = trend_df['Date'].dt.strftime('%Y-%m-%d')
        trend_points = trend_df.rename(columns={
            'TrendLine': 'trend_line'
        })[['Date', 'presence', 'trend_line', 'sample_size']].to_dict(orient='records')

        absentee_alerts = refined_df[refined_df['Employee Status'] == 'Absent'][['Name', 'Date']].copy()
        absentee_alerts['Date'] = absentee_alerts['Date'].dt.strftime('%Y-%m-%d')
        absentee_alerts = absentee_alerts.to_dict(orient='records')

        # Formatting Date output back to string format safely
        refined_df['Date'] = refined_df['Date'].dt.strftime('%Y-%m-%d')

        output_file = os.path.join(os.path.dirname(filepath), 'refined_attendance.csv')
        refined_df.to_csv(output_file, index=False)

        return jsonify(clean_for_json({
            'success': True,
            'trend': trend,
            'analytics': {
                'On Time': int(on_time_count),
                'Late Login': int(late_login_count),
                'Early Login': int(early_login_count),
                'Late Logout': int(late_logout_count),
                'Early Logout': int(early_logout_count),
                'Overtime Days': overtime_count
            },
            'checkin_counts': {
                'On Time': int(on_time_count),
                'Late Login': int(late_login_count),
                'Early Login': int(early_login_count)
            },
            'status_counts': status_counts,
            'risk_counts': risk_counts,
            'employee_attendance_scores': employee_attendance_scores,
            'max_late_employees': max_late_employees,
            'overtime_employees': overtime_employees,
            'most_holidays_taken': most_holidays_taken,
            'overtime_points': overtime_points,
            'login_logout_comparison': login_logout_comparison,
            'trend_points': trend_points,
            'trend_slope': float(slope),
            'trend_model_quality': trend_model_quality,
            'high_resignation_risk': high_resignation_risk,
            'alerts': absentee_alerts,
            'total_records': int(len(refined_df)),
            'output_csv': output_file,
            'records': refined_df.fillna('').to_dict(orient='records')
        }))

    except Exception as e:
        print("\nERROR:", str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])

def home():
    return jsonify({'message': 'Attendance AI Server Running'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
