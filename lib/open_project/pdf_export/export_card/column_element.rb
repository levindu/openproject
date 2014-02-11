#-- copyright
# OpenProject PDF Export Plugin
#
# Copyright (C)2014 the OpenProject Foundation (OPF)
#
# This program is free software; you can redistribute it and/or modify it under
# the terms of the GNU General Public License version 3.
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See doc/COPYRIGHT.md for more details.
#++

module OpenProject::PdfExport::ExportCard
  class ColumnElement
    def initialize(pdf, property_name, config, orientation, work_package)
      @pdf = pdf
      @property_name = property_name
      @config = config
      @orientation = orientation
      @work_package = work_package
    end

    def draw
      # Get value from model
      value = @work_package.send(@property_name) if @work_package.respond_to?(@property_name) else ""
      draw_value(value)
    end

    private

    def label_text(has_label, value)
      if has_label
        custom_label = @config['custom_label']
        label_text = if custom_label
                  "#{custom_label}"
                else
                  "#{@work_package.class.human_attribute_name(@property_name)}"
                end
        if @config['has_count'] && value.is_a?(Array)
          label_text = "#{label_text} (#{value.count})"
        end

        label_text += ": "
      else
        label_text = ""
      end
      label_text
    end

    def abbreviated_text(text, options)
      options = options.merge!({ document: @pdf })
      text_box = Prawn::Text::Box.new(text, options)
      left_over = text_box.render(:dry_run => true)

      # Be sure to do length arithmetics on chars, not bytes!
      left_over = left_over.mb_chars
      text      = text.to_s.mb_chars

      text = left_over.size > 0 ? text[0 ... -(left_over.size + 5)] + "[...]" : text
      text.to_s
    rescue Prawn::Errors::CannotFit
      ''
    end

    def draw_value(value)
      # Font size
      if @config['font_size']
        # Specific size given
        overflow = :truncate
        font_size = Integer(@config['font_size'])

      elsif @config['min_font_size']
        # Range given
        overflow = :shrink_to_fit
        min_font_size = Integer(@config['min_font_size'])
        font_size = if @config['max_font_size']
                      Integer(@config['max_font_size'])
                    else
                      min_font_size
                    end
      else
        # Default
        font_size = 12
        overflow = :truncate
      end

      font_style = (@config['font_style'] or "normal").to_sym
      text_align = (@config['text_align'] or "left").to_sym

      # Label and text
      has_label = @config['has_label']
      indented = @config['indented']

      # Flatten value to a display string
      display_value = value
      display_value = display_value.map{|c| c.to_s }.join("\n") if display_value.is_a?(Array)
      display_value = display_value.to_s if !display_value.is_a?(String)

      if has_label && indented
        width_ratio = 0.2 # Note: I don't think it's worth having this in the config

        # Label Textbox
        offset = [@orientation[:x_offset], @orientation[:height] - (@orientation[:text_padding] / 2)]
        box = @pdf.text_box(label_text(has_label, value),
          {:height => @orientation[:height],
           :width => @orientation[:width] * width_ratio,
           :at => offset,
           :style => :bold,
           :overflow => overflow,
           :size => font_size,
           :min_font_size => min_font_size,
           :align => :left})

        # Get abbraviated text
        options = {:height => @orientation[:height],
          :width => @orientation[:width] * (1 - width_ratio),
          :at => offset,
          :style => font_style,
          :overflow => overflow,
          :size => font_size,
          :min_font_size => min_font_size,
          :align => text_align}
        text = abbreviated_text(display_value, options)
        offset = [@orientation[:x_offset] + (@orientation[:width] * width_ratio), @orientation[:height] - (@orientation[:text_padding] / 2)]

        # Content Textbox
        box = @pdf.text_box(text, {:height => @orientation[:height],
          :width => @orientation[:width] * (1 - width_ratio),
          :at => offset,
          :style => font_style,
          :overflow => overflow,
          :size => font_size,
          :min_font_size => min_font_size,
          :align => text_align})
      else
        options = {:height => @orientation[:height],
          :width => @orientation[:width],
          :at => offset,
          :style => font_style,
          :overflow => overflow,
          :min_font_size => min_font_size,
          :align => text_align}
        text = abbreviated_text(display_value, options)
        texts = [{ text: label_text(has_label, value), styles: [:bold], :size => font_size },  { text: text, :size => font_size }]

        # Label and Content Textbox
        offset = [@orientation[:x_offset], @orientation[:height] - (@orientation[:text_padding] / 2)]
        box = @pdf.formatted_text_box(texts, {:height => @orientation[:height],
          :width => @orientation[:width],
          :at => offset,
          :style => font_style,
          :overflow => overflow,
          :min_font_size => min_font_size,
          :align => text_align})
      end
    end
  end
end
